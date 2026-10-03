import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setImmediate as tick} from 'node:timers/promises';
import {searchSources,normalizeDiscovered,discoverJobs} from '../server/discovery.mjs';
import {publicURL,publicIPv4} from '../server/web.mjs';
import {mailCredentials,readRecruitmentMail,normalizeMailEvents,createMailboxManager} from '../server/mail.mjs';
import {initialState,validateBackup} from '../js/storage.js';
import {recordDelivery} from '../js/delivery.js';
import {applyTaskSkill} from '../server/skills.mjs';
import {createServer} from '../server.mjs';
import {extractResume} from '../server/documents.mjs';
const workspaceId='12345678-1234-1234-1234-123456789abc';
const config={key:'TEST_ONLY',baseURL:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'};
const credential={provider:'qq',email:'tester@qq.com',password:'TEST_AUTHORIZATION_CODE',consent:true};
const applications=[{id:'a1',company:'测试公司',title:'前端开发',status:'applied',isSample:false}];
const message={id:'mail1',subject:'测试公司面试邀请',from:'hr@example.org',text:'邀请你参加前端开发岗位的面试。',receivedAt:'2026-10-02T01:00:00Z'};
const event={mailId:'mail1',applicationId:'a1',status:'interview',summary:'收到面试邀请',evidence:'邀请你参加前端开发岗位的面试。',confidence:0.9};
const source={sourceIndex:0,url:'https://example.org/jobs/1',title:'公司招聘',text:'测试公司正在招聘前端开发工程师，工作地点为上海，需要掌握 React。'.repeat(4)};
const jobRow={sourceIndex:0,title:'前端开发工程师',company:'测试公司',city:'上海',evidence:'招聘前端开发工程师',skills:['React']};
const fakes=(overrides={})=>({verify:async()=>{},readMail:async()=>({messages:[],cursor:0,validity:'1'}),ai:async()=>({result:{events:[]}}),...overrides});
async function settle(m){for(let i=0;i<100&&m.status(workspaceId).accounts.some(a=>a.syncing);i++)await tick();assert.ok(!m.status(workspaceId).accounts.some(a=>a.syncing));}
test('reader rejects private addresses and unsafe URLs',()=>{
 for(const ip of ['127.0.0.1','10.0.0.2','169.254.169.254','172.16.0.1','192.168.2.1','100.64.0.1','224.0.0.1','::1'])assert.equal(publicIPv4(ip),false);
 assert.equal(publicIPv4('8.8.8.8'),true);
 for(const url of ['http://example.org','https://127.0.0.1','https://localhost','https://10.1.1.1','https://user:pass@example.org','https://example.org:3000','file:///etc/passwd'])assert.equal(publicURL(url),'');
 assert.equal(publicURL('https://example.org/jobs#fragment'),'https://example.org/jobs');
});
test('search only trusts provider source metadata',async()=>{
 const sources=await searchSources(config,{query:'前端'}, {fetchImpl:async(url,options)=>{assert.ok(url.endsWith('/api/v1/services/aigc/text-generation/generation'));const body=JSON.parse(options.body);assert.equal(body.parameters.search_options.forced_search,true);assert.equal(body.parameters.search_options.enable_source,true);return new Response(JSON.stringify({output:{choices:[{message:{content:'https://fabricated.invalid/job'}}],search_info:{search_results:[{url:source.url,title:source.title},{url:source.url},{url:'https://127.0.0.1'}]}}}));}});
 assert.equal(sources.length,1);assert.equal(sources[0].url,source.url);
});
test('jobs require exact source evidence, deduplicate and keep unknown dates blank',()=>{
 const jobs=normalizeDiscovered([jobRow,jobRow,{...jobRow,sourceIndex:99},{...jobRow,evidence:'编造的岗位'}],[source]);assert.equal(jobs.length,1);assert.equal(jobs[0].source,'web');assert.equal(jobs[0].url,source.url);assert.equal(jobs[0].postedAt,'');assert.equal(jobs[0].availability,'待官网确认');assert.equal(normalizeDiscovered([jobRow],[source])[0].id,jobs[0].id);
});
test('restricted recruiting pages do not result in invented or demo jobs',async()=>{
 const result=await discoverJobs(config,{query:'前端'},{search:async()=>[source],readPage:async()=>{throw new Error('restricted');},ai:async()=>{assert.fail('No source must mean no AI extraction');}});assert.deepEqual(result.jobs,[]);assert.equal(result.sources[0].readable,false);assert.equal(result.stages[1].count,0);
 const ok=await discoverJobs(config,{query:'前端'},{search:async()=>[source],readPage:async()=>source,ai:async()=>({result:{jobs:[jobRow]}})});assert.equal(ok.jobs.length,1);
});
test('QQ and 163 credentials require the correct domain and consent',()=>{
 assert.equal(mailCredentials(credential).provider,'qq');assert.equal(mailCredentials({...credential,email:'tester@163.com',provider:'netease'}).provider,'netease');
 assert.throws(()=>mailCredentials({...credential,consent:false}),/同意/);assert.throws(()=>mailCredentials({...credential,email:'tester@gmail.com'}),/不匹配/);assert.throws(()=>mailCredentials({...credential,password:''}),/授权码/);
});
test('INBOX is read-only and changed UIDVALIDITY resets the cursor',async()=>{
 const client=new EventEmitter();let released=false,loggedOut=false,query;Object.assign(client,{mailbox:{uidValidity:2n},connect:async()=>{},getMailboxLock:async(name,opts)=>{assert.equal(name,'INBOX');assert.equal(opts.readOnly,true);return {release(){released=true;}};},search:async value=>{query=value;return [];},logout:async()=>{loggedOut=true;}});
 const result=await readRecruitmentMail({...credential,cursor:900,validity:'1'},[],{clientFactory:()=>client});assert.equal(result.cursor,0);assert.equal(result.validity,'2');assert.ok(query.since instanceof Date);assert.ok(released&&loggedOut);
});
test('mail reader skips old UIDs, nonrecruiting messages and oversized bodies',async()=>{
 const client=new EventEmitter(),fetched=[];Object.assign(client,{mailbox:{uidValidity:1n},connect:async()=>{},getMailboxLock:async()=>({release(){}}),search:async()=>[1,2,3,4],fetchOne:async(id,fields)=>{fetched.push({id,fields});if(fields.source){assert.equal(fields.source.maxLength,300000);return {source:Buffer.from('From: hr@example.org\r\nSubject: Interview\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nInterview invitation')};}return {envelope:{subject:id===2?'Promotion':'Interview',from:[{address:'hr@example.org'}]},size:id===3?400000:200};},logout:async()=>{}});
 const result=await readRecruitmentMail({...credential,cursor:1,validity:'1'},[],{clientFactory:()=>client});assert.equal(result.cursor,4);assert.equal(result.messages.length,1);assert.equal(result.messages[0].text,'Interview invitation');assert.ok(!fetched.some(f=>f.id===1));assert.equal(fetched.filter(f=>f.fields.source).length,1);
});
test('mail events need exact evidence and remain pending user review',()=>{
 const rows=normalizeMailEvents([event,event,{...event,mailId:'invented'}],[message],applications,'tester@qq.com');assert.equal(rows.length,1);assert.equal(rows[0].review,'pending');assert.equal(rows[0].eventAt,'');assert.equal(rows[0].applicationId,'a1');
 assert.equal(normalizeMailEvents([{...event,evidence:'invented'}],[message],applications,'x').length,0);assert.equal(normalizeMailEvents([{...event,applicationId:'invented',eventAt:'2026-10-03'}],[message],applications,'x')[0].applicationId,'');
});
test('both mailbox types coexist and AI retry does not lose or duplicate mail',async t=>{
 let fail=true,reads=[];const m=createMailboxManager(config,fakes({readMail:async a=>{reads.push(a.cursor||0);return {messages:[message],cursor:7,validity:'1'};},ai:async()=>{if(fail)throw new Error('TEST_AUTHORIZATION_CODE');return {result:{events:[event]}};}}));t.after(()=>m.close());m.update(workspaceId,applications);
 await m.connect(workspaceId,credential);await settle(m);assert.ok(m.status(workspaceId).accounts[0].error);fail=false;await m.sync(workspaceId);await m.sync(workspaceId);assert.equal(reads[1],0);assert.equal(reads[2],7);assert.equal(m.status(workspaceId).events.length,1);
 await m.connect(workspaceId,{...credential,provider:'netease',email:'tester@163.com'});await settle(m);assert.equal(m.status(workspaceId).accounts.length,2);assert.ok(!JSON.stringify(m.status(workspaceId)).includes(credential.password));m.disconnect(workspaceId,credential.email);assert.equal(m.status(workspaceId).accounts.length,1);
});
const deliveryData=()=>({accountId:credential.email,to:'hr@example.org',subject:'应聘前端',text:'请查收简历',job:{id:'job1',source:'web'},profile:{name:'测试同学',isSample:false},resume:{facts:[{section:'projects',text:'真实项目事实',source:'USER',status:'accepted'}]}});
test('sending uses frozen DOCX, requires confirmation and is idempotent',async t=>{
 let sends=0,sent;const m=createMailboxManager(config,fakes({sendMail:async(_a,msg)=>{sends++;sent=msg;return {accepted:['hr@example.org'],messageId:'sent-1'};}}));t.after(()=>m.close());await m.connect(workspaceId,credential);const data=deliveryData(),p=await m.prepare(workspaceId,data);data.resume.facts[0].text='CHANGED_AFTER_PREVIEW';const doc=await extractResume({filename:'resume.docx',content:m.attachment(workspaceId,p.token).toString('base64')});assert.ok(doc.text.includes('真实项目事实'));assert.ok(!doc.text.includes('CHANGED_AFTER_PREVIEW'));
 await assert.rejects(m.send(workspaceId,p.token,false),/确认/);const receipt=await m.send(workspaceId,p.token,true);assert.equal(receipt.status,'sent');assert.equal((await m.send(workspaceId,p.token,true)).messageId,'sent-1');assert.equal(sends,1);assert.equal(sent.text,'请查收简历');assert.equal(m.receipt(workspaceId,p.token).status,'sent');assert.throws(()=>m.attachment('another-workspace-1234567',p.token));
});
test('uncertain send never retries; demo and unconfirmed content cannot send',async t=>{
 let sends=0;const m=createMailboxManager(config,fakes({sendMail:async()=>{sends++;throw new Error('transport disconnected');}}));t.after(()=>m.close());await m.connect(workspaceId,credential);let data=deliveryData();data.profile.isSample=true;await assert.rejects(m.prepare(workspaceId,data),/示例/);data=deliveryData();data.resume.facts[0].status='pending';await assert.rejects(m.prepare(workspaceId,data),/核实/);const p=await m.prepare(workspaceId,deliveryData());await assert.rejects(m.send(workspaceId,p.token,true),/未能确认/);assert.equal(m.receipt(workspaceId,p.token).status,'uncertain');await assert.rejects(m.send(workspaceId,p.token,true),/勿重复/);assert.equal(sends,1);
});
test('opening official application page stays saved until submission confirmed',()=>{
 const state=initialState([],false),ctx={store:{state},save(){}};const job={id:'job1',company:'测试公司',title:'前端开发',source:'web',url:source.url};const v={id:'v1'};const app=recordDelivery(ctx,job,v,{channel:'招聘官网'});assert.equal(app.status,'saved');assert.equal(app.appliedAt,null);recordDelivery(ctx,job,v,{channel:'招聘官网',status:'applied'});assert.equal(app.status,'applied');assert.ok(app.appliedAt);assert.equal(state.applications.length,1);
});
test('backup preserves Agent state without authorization codes',()=>{
 const state=initialState([],false);state.agent.search={ids:['job1'],summary:'结果',sources:[source],stages:[],searchedAt:'2026-10-02T00:00:00Z'};state.agent.mailEvents=[{...normalizeMailEvents([event],[message],applications,'x')[0],password:credential.password}];state.agent.password=credential.password;state.agent.pendingSends=[{token:'t1',applicationId:'a1'}];state.customJobs=normalizeDiscovered([jobRow],[source]);const backup=validateBackup(state);assert.equal(backup.customJobs[0].source,'web');assert.equal(backup.customJobs[0].postedAt,'');assert.equal(backup.agent.mailEvents[0].review,'pending');assert.equal(backup.agent.pendingSends[0].token,'t1');assert.ok(!JSON.stringify(backup).includes(credential.password));
});
test('project resume Skill is only appended to resume generation',()=>{
 const messages=()=>[{role:'system',content:'base'},{role:'user',content:'{}'}];assert.ok(applyTaskSkill('resume',messages())[0].content.includes('原文没有数字'));assert.equal(applyTaskSkill('mailProgress',messages())[0].content,'base');
});
test('Agent routes enforce CSRF and discovery consent',async t=>{
 const server=createServer(config,{discover:async()=>({jobs:[],sources:[]}),mail:fakes()});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const base='http://127.0.0.1:'+server.address().port,settings=await(await fetch(base+'/api/config')).json();const post=(path,payload,token=settings.csrfToken)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Jobseeker-Token':token},body:JSON.stringify(payload)});
 assert.equal((await post('/api/jobs/discover',{preferences:{query:'前端'},consent:false})).status,403);assert.equal((await post('/api/jobs/discover',{preferences:{query:'前端'},consent:true})).status,200);assert.equal((await post('/api/mail/status',{workspaceId},'invalid')).status,403);const connected=await post('/api/mail/connect',{...credential,workspaceId,applications});assert.equal(connected.status,200);assert.ok(!(await connected.text()).includes(credential.password));
});

