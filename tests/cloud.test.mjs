import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCloudService } from '../server/cloud/service.mjs';
import { cloudSecurity } from '../server/cloud/security.mjs';
import { encryptedStore, rateLimit, withLease } from '../server/cloud/store.mjs';
import { createMailboxManager } from '../server/mail.mjs';
import { readFile } from 'node:fs/promises';
import { extractResume } from '../server/documents.mjs';

const env={JOBSEEKER_SECRET:'unit-test-secret-only-12345678901234567890',DASHSCOPE_API_KEY:'unit-test-qwen-key',DASHSCOPE_MODEL:'qwen-plus',DEPLOY_URL:'https://test-deploy.netlify.app'};
const config={key:env.DASHSCOPE_API_KEY,model:env.DASHSCOPE_MODEL};
test('PDF import uses the loading task lifecycle and extracts a real page',async()=>{
  const bytes=await readFile(new URL('./fixtures/text.pdf',import.meta.url));
  const result=await extractResume({filename:'text.pdf',content:bytes.toString('base64')});
  assert.equal(result.pages,1);assert.ok(result.text.includes('Netlify deployment check'));
});
const workspaceId='12345678-1234-1234-1234-123456789abc';
const credential={provider:'qq',email:'tester@qq.com',password:'unit-test-mail-authorization',consent:true};
const mail={verify:async()=>{},readMail:async()=>({messages:[],cursor:1,validity:'1'}),ai:async()=>({result:{events:[]}})};
class MemoryStore {
  rows=new Map(); version=0;
  async getWithMetadata(key){const row=this.rows.get(key);return row?structuredClone(row):null;}
  async setJSON(key,data,options={}){const old=this.rows.get(key);if(options.onlyIfNew&&old||options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return {modified:false};const etag=String(++this.version);this.rows.set(key,{data:structuredClone(data),etag});return {modified:true,etag};}
  async delete(key){this.rows.delete(key);}
  async *list({prefix}){yield {blobs:[...this.rows.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
}
function fixture(extra={}){
  const store=new MemoryStore(),dispatched=[];
  const options={store,env,fetchImpl:async(url,init)=>{dispatched.push({url,...init});return new Response(null,{status:202});},services:{ai:async()=>({result:{ok:true}}),...extra}};
  const service=createCloudService(options);
  return {store,service,options,dispatched};
}
async function session(service){
  const response=await service.handle(new Request(env.DEPLOY_URL+'/api/config'));
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();
  return {cookie,token:data.csrfToken,config:data};
}
const req=(route,payload,auth,extra={})=>new Request(env.DEPLOY_URL+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:env.DEPLOY_URL,cookie:auth?.cookie||'','X-Jobseeker-Token':auth?.token||'',...extra},body:JSON.stringify(payload)});
async function run(service,route,payload,auth){
  const response=await service.handle(req(route,payload,auth));assert.equal(response.status,202,await response.clone().text());const task=await response.json();
  await service.processTask(task.taskId);
  return (await service.vault.read('tasks/'+task.taskId)).value;
}

test('cloud requires explicit secrets and encrypts records with authenticated names',async()=>{
  assert.throws(()=>cloudSecurity({}),/JOBSEEKER_SECRET/);
  const {store,service}=fixture();await service.vault.write('mail/private',{password:credential.password});
  const raw=JSON.stringify([...store.rows]);assert.ok(!raw.includes(credential.password));
  assert.equal((await service.vault.read('mail/private')).value.password,credential.password);
  assert.throws(()=>service.security.open('different-key',store.rows.get('mail/private').data));
  assert.throws(()=>cloudSecurity({...env,JOBSEEKER_SECRET:'a-different-secret-with-at-least-32-characters'}).open('mail/private',store.rows.get('mail/private').data));
});

test('visitors enter without a password while cookies, origin and CSRF protect their APIs',async()=>{
  const {service}=fixture();
  const bootstrap=await service.handle(new Request(env.DEPLOY_URL+'/api/config'));
  assert.equal(bootstrap.status,200);
  assert.match(bootstrap.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await service.handle(new Request(env.DEPLOY_URL+'/api/config',{headers:{Origin:'https://other.example'}}))).status,403);
  const auth=await session(service);assert.ok(auth.token);assert.equal(auth.config.hosting,'netlify');assert.equal(auth.config.defaultMode,'live');assert.equal(auth.config.unifiedAI,true);assert.equal(auth.config.capabilities.unifiedAI,true);
  assert.equal(auth.config.authenticationRequired,undefined);
  assert.ok(!JSON.stringify(auth.config).includes(env.DASHSCOPE_API_KEY));
  assert.equal((await service.handle(req('/api/ai',{task:'connection',payload:{}},{...auth,token:'forged'}))).status,403);
  assert.equal((await service.handle(req('/api/ai',{task:'resume',payload:{},consent:false},auth))).status,403);
  assert.equal((await service.handle(req('/api/ai',{task:'connection',payload:{}},null))).status,401);
  const current=service.security.authenticate(req('/api/ai',{},auth));
  const refreshed=await service.handle(new Request(env.DEPLOY_URL+'/api/config',{headers:{cookie:auth.cookie}}));
  const refreshedAuth={cookie:refreshed.headers.get('set-cookie').split(';')[0]};
  assert.equal(service.security.authenticate(req('/api/ai',{},refreshedAuth)).visitor,current.visitor);
  assert.equal((await refreshed.json()).csrfToken,auth.token);
  const legacy=Buffer.from(JSON.stringify({nonce:current.nonce,version:'old-password-version',exp:Date.now()+100000})).toString('base64url');
  const legacyResponse=await service.handle(new Request(env.DEPLOY_URL+'/api/config',{headers:{cookie:'jobseeker_session='+legacy+'.'+service.security.sign('session',legacy)}}));
  assert.equal(legacyResponse.status,200);assert.ok(legacyResponse.headers.get('set-cookie'));
  const tampered=auth.cookie.slice(0,-3)+'xxx';assert.equal(service.security.authenticate(req('/api/ai',{},{cookie:tampered})),null);
  assert.equal((await service.handle(req('/api/auth/login',{},auth))).status,404);
  assert.equal((await service.handle(req('/api/auth/logout',{},auth))).status,404);
});

test('concurrent limits and leases use atomic conditional writes',async()=>{
  const store=new MemoryStore(),vault=encryptedStore(store,cloudSecurity(env));
  const results=await Promise.allSettled(Array.from({length:8},()=>rateLimit(vault,'one',3)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  let release;const gate=new Promise(resolve=>{release=resolve;});
  let entered;const ready=new Promise(resolve=>{entered=resolve;});
  const first=withLease(vault,'mail',async()=>{entered();await gate;});await ready;
  await assert.rejects(withLease(vault,'mail',()=>assert.fail()),error=>error.code==='BUSY');
  release();await first;await withLease(vault,'mail',async()=>{});
});

test('AI task survives a cold start and a repeated worker cannot execute it twice',async()=>{
  let calls=0;const {service,options,dispatched}=fixture({ai:async()=>{calls++;return {result:{ok:true}};}});const auth=await session(service);
  const response=await service.handle(req('/api/ai',{task:'connection',payload:{}},auth));assert.equal(response.status,202);const {taskId}=await response.json();
  assert.equal(dispatched.length,1);assert.ok(!dispatched[0].body.includes(env.DASHSCOPE_API_KEY));
  const cold=createCloudService(options);await cold.processTask(taskId);await createCloudService(options).processTask(taskId);assert.equal(calls,1);
  const result=await cold.handle(new Request(env.DEPLOY_URL+'/api/tasks?id='+taskId,{headers:{cookie:auth.cookie}}));assert.deepEqual((await result.json()).result,{result:{ok:true}});
  const stored=(await cold.vault.read('tasks/'+taskId)).value;assert.equal(stored.payload,undefined);
  const forged=await cold.worker(new Request(env.DEPLOY_URL+'/.netlify/functions/worker-background',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId})}));assert.equal(forged.status,403);
});

test('chunked imports reassemble privately, extract text and remove uploads',async()=>{
  const {service}=fixture();const auth=await session(service),text='这是可核对的简历原文。';
  const content=Buffer.from(text.repeat(40)).toString('base64'),split=80;
  const start=await service.handle(req('/api/uploads/start',{filename:'resume.txt',total:2},auth));const {uploadId}=await start.json();
  for(const [index,part] of [content.slice(0,split),content.slice(split)].entries())assert.equal((await service.handle(req('/api/uploads/chunk',{uploadId,index,content:part},auth))).status,200);
  assert.equal((await service.handle(req('/api/uploads/chunk',{uploadId,index:2,content:'a'},auth))).status,400);
  const job=await run(service,'/api/resume/extract',{uploadId},auth);assert.equal(job.state,'done');assert.equal(job.result.text,text.repeat(40));
  assert.equal(await service.vault.read('uploads/'+uploadId),null);assert.equal(await service.vault.read('uploads/'+uploadId+'/0'),null);
});

test('mail credentials and confirmed send receipt survive cold starts without a second SMTP send',async()=>{
  let sent=0;const {service,options,store}=fixture({mail:{...mail,sendMail:async()=>{sent++;return {accepted:['hr@example.org'],messageId:'test-message'};}}});const auth=await session(service);
  const connected=await run(service,'/api/mail/connect',{workspaceId,...credential},auth);assert.equal(connected.state,'done');assert.equal(connected.result.accounts.length,1);
  assert.ok(!JSON.stringify([...store.rows]).includes(credential.password));
  const cold=createCloudService(options),status=await cold.handle(req('/api/mail/status',{workspaceId,applications:[]},auth));assert.equal((await status.json()).accounts[0].email,credential.email);
  const data={workspaceId,accountId:credential.email,to:'hr@example.org',subject:'测试投递',text:'真实简历',job:{id:'job1',source:'web'},profile:{name:'测试人',isSample:false},resume:{facts:[{section:'projects',text:'已确认的真实项目',source:'USER',status:'accepted'}]}};
  const prepared=await run(cold,'/api/mail/prepare',data,auth);assert.equal(prepared.state,'done');const token=prepared.result.token;
  const receipt=await run(createCloudService(options),'/api/mail/send',{workspaceId,token,confirmed:true},auth);assert.equal(receipt.state,'done');assert.equal(receipt.result.status,'sent');
  const repeated=await run(createCloudService(options),'/api/mail/send',{workspaceId,token,confirmed:true},auth);assert.equal(repeated.result.messageId,'test-message');assert.equal(sent,1);
  const attachment=await createCloudService(options).handle(req('/api/mail/attachment',{workspaceId,token},auth));assert.equal(attachment.status,200);assert.match(attachment.headers.get('content-type'),/wordprocessingml/);
  const disconnected=await run(createCloudService(options),'/api/mail/disconnect',{workspaceId,accountId:credential.email},auth);assert.equal(disconnected.result.accounts.length,0);
  assert.ok(!JSON.stringify((await service.vault.read((await service.vault.keys('mail/'))[0])).value).includes(credential.password));
});

test('SMTP begins only after its sending marker is persisted and remains non-retriable after uncertainty',async()=>{
  let saved,sends=0;
  const manager=createMailboxManager(config,{...mail,interval:0,autoSync:false,checkpoint:async state=>{saved=structuredClone(state);},sendMail:async()=>{sends++;assert.equal(saved.drafts[0][1].state,'sending');throw new Error('network uncertain');}});
  await manager.connect(workspaceId,credential);
  const preview=await manager.prepare(workspaceId,{accountId:credential.email,to:'hr@example.org',subject:'应聘',text:'真实材料',job:{source:'web'},profile:{name:'测试人'},resume:{facts:[{section:'summary',text:'已核实的经历',source:'USER',status:'accepted'}]}});
  await assert.rejects(manager.send(workspaceId,preview.token,true),/未能确认/);manager.close();
  const cold=createMailboxManager(config,{...mail,interval:0,autoSync:false,initialState:saved,sendMail:async()=>{sends++;}});
  await assert.rejects(cold.send(workspaceId,preview.token,true),/不确定/);assert.equal(sends,1);cold.close();
});

test('scheduler keeps connected mailboxes active and skips ones with an in-flight lease',async()=>{
  const {service,dispatched}=fixture({mail});const auth=await session(service);
  await run(service,'/api/mail/connect',{workspaceId,...credential},auth);dispatched.length=0;
  assert.equal((await service.schedule()).scheduled,1);assert.ok(dispatched.some(d=>d.url.endsWith('/worker-background')));
  await service.vault.write('locks/mail-'+(await service.vault.keys('mail/'))[0].slice(5),{owner:randomUUID(),until:Date.now()+100000});
  assert.equal((await service.schedule()).scheduled,0);
});


test('visitors cannot read each others queued, finished or failed tasks',async()=>{
  const {service}=fixture({ai:async(_config,task)=>{if(task==='fail')throw new Error('internal failure');return {result:{private:'first visitor'}};}});
  const first=await session(service),second=await session(service);
  for(const task of ['connection','fail']){
    const queued=await service.handle(req('/api/ai',{task,payload:{},consent:true},first));assert.equal(queued.status,202);
    const {taskId}=await queued.json();
    const poll=auth=>service.handle(new Request(env.DEPLOY_URL+'/api/tasks?id='+taskId,{headers:{cookie:auth.cookie}}));
    assert.equal((await poll(second)).status,404);
    await service.processTask(taskId);
    assert.equal((await poll(second)).status,404);
    const own=await poll(first);assert.equal(own.status,200);assert.equal((await own.json()).state,task==='fail'?'error':'done');
  }
});

test('upload ownership blocks cross-visitor chunks, extraction and unrelated cleanup',async()=>{
  const {service}=fixture();const first=await session(service),second=await session(service);
  const start=await service.handle(req('/api/uploads/start',{filename:'private.txt',total:1},first));
  const {uploadId}=await start.json();
  const chunk={uploadId,index:0,content:Buffer.from('private resume').toString('base64')};
  assert.equal((await service.handle(req('/api/uploads/chunk',chunk,second))).status,404);
  assert.equal((await service.handle(req('/api/resume/extract',{uploadId},second))).status,404);
  await run(service,'/api/ai',{task:'connection',payload:{},uploadId},second);
  assert.ok(await service.vault.read('uploads/'+uploadId));
  assert.equal((await service.handle(req('/api/uploads/chunk',chunk,first))).status,200);
  const own=await run(service,'/api/resume/extract',{uploadId},first);assert.equal(own.state,'done');assert.equal(own.result.text,'private resume');
});

test('identical browser workspace IDs do not share mail, attachments or send receipts',async()=>{
  let sends=0;const {service}=fixture({mail:{...mail,sendMail:async()=>{sends++;return {accepted:['hr@example.org'],messageId:'isolated-send'};}}});
  const first=await session(service),second=await session(service);
  await run(service,'/api/mail/connect',{workspaceId,...credential},first);
  const status=await service.handle(req('/api/mail/status',{workspaceId},second));assert.equal((await status.json()).accounts.length,0);
  const prepared=await run(service,'/api/mail/prepare',{workspaceId,accountId:credential.email,to:'hr@example.org',subject:'应聘',text:'已确认的真实材料',job:{id:'job',source:'web'},profile:{name:'测试人'},resume:{facts:[{section:'summary',text:'真实经历',source:'USER',status:'accepted'}]}},first);
  assert.equal(prepared.state,'done');const token=prepared.result.token;
  assert.equal((await service.handle(req('/api/mail/attachment',{workspaceId,token},second))).ok,false);
  const receipt=await service.handle(req('/api/mail/receipt',{workspaceId,token},second));assert.equal((await receipt.json()).status,'unknown');
  const forbiddenSend=await run(service,'/api/mail/send',{workspaceId,token,confirmed:true},second);assert.equal(forbiddenSend.state,'error');assert.equal(sends,0);
  await run(service,'/api/mail/disconnect',{workspaceId,accountId:credential.email},second);
  const own=await service.handle(req('/api/mail/status',{workspaceId},first));assert.equal((await own.json()).accounts[0].email,credential.email);
  const renewed=await service.handle(new Request(env.DEPLOY_URL+'/api/config',{headers:{cookie:first.cookie}}));
  const renewedAuth={cookie:renewed.headers.get('set-cookie').split(';')[0],token:(await renewed.json()).csrfToken};
  const delivered=await run(service,'/api/mail/send',{workspaceId,token,confirmed:true},renewedAuth);assert.equal(delivered.state,'done');assert.equal(sends,1);
});
