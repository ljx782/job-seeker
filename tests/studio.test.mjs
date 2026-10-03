import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {requestQwen} from '../server/ai.mjs';
import {extractResume,buildResumeDocx} from '../server/documents.mjs';
import {initialState,validateBackup,sampleProfile} from '../js/storage.js';
import {demoDraft,profileFacts} from '../js/domain.js';
import {appendSuggestions,safeProfile} from '../js/studio-data.js';

test('local API requires same origin and CSRF, never serves secrets or server sources',async t=>{
  const config={port:0,key:'SECRET_SENTINEL',model:'qwen-plus',defaultMode:'demo'};
  const server=createServer(config,{requestAI:async(_config,task)=>({result:{ok:true,task},model:'qwen-plus'})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/api/config'),data=await response.json();assert.equal(data.configured,true);assert.ok(!JSON.stringify(data).includes(config.key));
  for(const path of ['/.env.local','/server/config.mjs','/node_modules/docx/package.json','/js/../.env.local'])assert.equal((await fetch(base+path)).status,403);
  assert.equal((await fetch(base+'/api/config',{headers:{Origin:'https://example.org'}})).status,403);
  const post=(payload,token=data.csrfToken)=>fetch(base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json','X-Jobseeker-Token':token},body:JSON.stringify(payload)});
  assert.equal((await post({task:'connection',payload:{}},'wrong')).status,403);
  assert.equal((await post({task:'resume',payload:{},consent:false})).status,403);
  const accepted=await post({task:'connection',payload:{}});assert.equal(accepted.status,200);assert.equal((await accepted.json()).result.ok,true);
});
test('Qwen sends the correct model and JSON schema without placing its key in the result',async()=>{
  const config={key:'TEST_KEY',baseURL:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'};
  const result=await requestQwen(config,'connection',{}, {fetchImpl:async(url,options)=>{assert.equal(url,config.baseURL+'/chat/completions');assert.equal(options.headers.Authorization,'Bearer TEST_KEY');const body=JSON.parse(options.body);assert.equal(body.model,'qwen-plus');assert.equal(body.enable_thinking,false);assert.equal(body.response_format.type,'json_object');return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:10,completion_tokens:4}}));}});
  assert.equal(result.result.ok,true);assert.equal(result.usage.inputTokens,10);assert.ok(!JSON.stringify(result).includes(config.key));
  await assert.rejects(requestQwen(config,'connection',{}, {fetchImpl:async()=>new Response('{"error":{"message":"DO_NOT_REFLECT"}}',{status:401})}),error=>error.code==='UPSTREAM_ERROR'&&!error.message.includes('DO_NOT_REFLECT'));
});
test('DOCX round trip preserves Chinese and excludes unconfirmed or suggested claims',async()=>{
  const facts=[{section:'experience',text:'已确认的真实中文经历',source:'USER',status:'accepted'},{section:'projects',text:'UNVERIFIED_CLAIM',source:'AI-INFER',status:'pending'},{section:'skills',text:'SUGGESTED_CLAIM',source:'AI-SUGGEST',status:'accepted'}];
  const buffer=await buildResumeDocx({profile:{name:'测试同学',role:'开发者'},resume:{facts}});
  const parsed=await extractResume({filename:'简历.docx',content:buffer.toString('base64')});assert.ok(parsed.text.includes('已确认的真实中文经历'));assert.ok(parsed.text.includes('测试同学'));assert.ok(!parsed.text.includes('CLAIM'));
  await assert.rejects(buildResumeDocx({profile:{name:'测试'},resume:{facts:[]}}),/确认/);
});
test('resume import rejects corrupt, empty and unsupported files',async()=>{
  for(const [filename,content] of [['bad.pdf','hello'],['bad.docx','hello'],['bad.exe','hello'],['empty.txt','   ']])await assert.rejects(extractResume({filename,content:Buffer.from(content).toString('base64')}));
  const text='姓名：测试\n项目：真实项目';assert.equal((await extractResume({filename:'resume.txt',content:Buffer.from(text).toString('base64')})).text,text);
});
test('backup preserves studio materials, conversations, imported original, trash and pending archived draft',()=>{
  const state=initialState([],false);state.settings.provider='qwen-local';state.settings.localSetupId='qwen-local-v1';
  state.studio={view:'coach',materials:[{id:'m1',title:'真实素材',text:'项目经历',section:'projects'}],messages:[{role:'assistant',text:'建议',suggestedFacts:[{section:'summary',text:'未经核实',source:'USER'}]}]};
  state.versions=[{id:'v1',name:'保留草稿',kind:'draft',savedAt:new Date().toISOString(),profile:sampleProfile(),facts:demoDraft(sampleProfile()),template:'tech',deletedAt:new Date().toISOString(),order:3},{id:'v2',name:'原件',kind:'original',sourceText:'原始资料文本',sourceFilename:'原件.txt',savedAt:new Date().toISOString(),profile:safeProfile({}),facts:[],template:'general'}];
  const data=validateBackup(state);assert.equal(data.studio.materials[0].text,'项目经历');assert.equal(data.studio.messages[0].suggestedFacts[0].source,'AI-INFER');assert.equal(data.settings.provider,'qwen-local');assert.equal(data.settings.localSetupId,'qwen-local-v1');assert.ok(data.versions[0].facts.length>0);assert.ok(data.versions[0].facts.every(f=>f.status==='pending'));assert.equal(data.versions[0].order,3);assert.ok(data.versions[0].deletedAt);assert.equal(data.versions[1].sourceText,'原始资料文本');
});
test('coach suggestions are deduplicated and cannot bypass provenance review',()=>{
  const state=initialState([],false);state.profile=sampleProfile();state.resume.facts=profileFacts(state.profile);const ctx={store:{state},save(){}};
  const raw=[{section:'projects',text:'未经证明的成果',source:'USER',status:'accepted'}];assert.equal(appendSuggestions(ctx,raw),1);assert.equal(appendSuggestions(ctx,raw),0);const fact=state.resume.facts.at(-1);assert.equal(fact.status,'pending');assert.equal(fact.source,'AI-INFER');
});
