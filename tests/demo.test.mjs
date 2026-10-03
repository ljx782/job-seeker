import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sampleProfile,initialState,validateBackup,createStore} from '../js/storage.js';
import {demoDraft,normalizeDraft,confirmedFacts,profileFacts} from '../js/domain.js';
import {isDemoDelivery,recordDemoDelivery} from '../js/delivery.js';
import {resumeHTML} from '../js/resume-builder.js';
const jobs=JSON.parse(await readFile(new URL('../data/mock-jobs.json',import.meta.url),'utf8'));
test('reset keeps the complete AI connection while replacing demo data',()=>{
 const previous=globalThis.localStorage;let data='';globalThis.localStorage={getItem(){return data||null;},setItem(_key,value){data=value;}};
 try{const store=createStore(jobs);Object.assign(store.state.settings,{localSetupId:'configured-service',mode:'live',provider:'qwen-local',model:'qwen-plus',endpoint:'',consent:true,theme:'dark'});assert.equal(store.reset(true),true);let restored=createStore(jobs);assert.equal(restored.state.settings.mode,'live');assert.equal(restored.state.settings.provider,'qwen-local');assert.equal(restored.state.settings.model,'qwen-plus');assert.equal(restored.state.settings.consent,true);assert.equal(restored.state.settings.theme,'dark');assert.equal(restored.state.settings.localSetupId,'configured-service');assert.equal(store.reset(false),true);restored=createStore(jobs);assert.equal(restored.state.settings.mode,'live');assert.equal(restored.state.settings.provider,'qwen-local');assert.equal(restored.state.settings.model,'qwen-plus');assert.equal(restored.state.settings.consent,true);assert.equal(restored.state.settings.localSetupId,'configured-service');}finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('realistic demo timeline uses distinct jobs, all stages, chronological history and complete profiles',()=>{
 const state=initialState(jobs);assert.equal(state.applications.length,12);assert.equal(new Set(state.applications.map(a=>a.jobId)).size,12);
 assert.equal(new Set(state.applications.map(a=>a.status)).size,7);
 for(const app of state.applications){assert.ok(jobs.some(j=>j.id===app.jobId));assert.equal(app.isSample,true);assert.equal(app.history.at(-1).status,app.status);assert.deepEqual(app.history.map(h=>h.at),app.history.map(h=>h.at).sort());}
 assert.equal(state.studio.materials.length,2);assert.equal(state.demoRevision,2);assert.equal(initialState([],true).applications.length,0);
});
test('demo rewriting preserves evidence and does not leave duplicated raw paragraphs',()=>{
 const profile=sampleProfile(),facts=demoDraft(profile,jobs[0]);
 assert.equal(facts.filter(f=>f.section==='summary').length,1);
 for(const section of ['experience','projects']){const items=facts.filter(f=>f.section===section&&f.source!=='AI-SUGGEST');assert.equal(items.length,profile[section].length);for(const f of items){assert.equal(f.source,'AI-INFER');assert.ok(f.text.includes('\n• '));assert.ok(f.originalText);}}
 const numbers=facts.filter(f=>f.source!=='AI-SUGGEST').flatMap(f=>f.text.match(/\d+/g)||[]);const original=JSON.stringify(profile);for(const n of numbers)assert.ok(original.includes(n));
 const custom={...profile,summary:'我负责页面',experience:[],projects:[{name:'小工具',description:'自己做了个网站，电脑和手机都能用。'}]};const small=demoDraft(custom);assert.ok(small.find(f=>f.section==='projects').text.includes('独立开发了网站'));assert.ok(!small.some(f=>f.text.includes('820')));
});
test('live rewrite gets original comparison only from known evidence and persists through backup',()=>{
 const profile=sampleProfile(),raw=profileFacts(profile).find(f=>f.section==='experience');
 const facts=normalizeDraft({facts:[{section:'experience',text:'优化后的项目表达',source:'USER',sourceRef:raw.sourceRef}]},profile);
 assert.equal(facts[0].originalText,raw.text);assert.equal(facts[0].source,'AI-INFER');assert.equal(confirmedFacts(facts).length,0);
 const state=initialState(jobs);state.resume.facts=facts;const restored=validateBackup(state);assert.equal(restored.resume.facts[0].originalText,raw.text);
 assert.ok(resumeHTML(profile,{facts,template:'tech'}).includes('查看原始输入'));assert.ok(!resumeHTML(profile,{facts,template:'tech'},{exporting:true}).includes('优化后的项目表达'));
});
test('demo delivery is separate from sent receipts, idempotent and cannot overwrite real applications',()=>{
 const state=initialState(jobs),ctx={store:{state},save(){}},job=jobs[0],version={id:'version-demo'};
 assert.ok(isDemoDelivery(state,job));assert.ok(isDemoDelivery({...state,settings:{mode:'live'}},job));
 const app=recordDemoDelivery(ctx,job,version),receipt=app.deliveryId,length=state.applications.length;
 assert.equal(app.status,'applied');assert.equal(app.deliveryState,'simulated');assert.equal(app.resumeVersion,version.id);assert.equal(app.isSample,true);
 recordDemoDelivery(ctx,job,version);assert.equal(app.deliveryId,receipt);assert.equal(state.applications.length,length);assert.equal(app.history.filter(h=>h.status==='applied').length,1);
 app.isSample=false;assert.throws(()=>recordDemoDelivery(ctx,job,version),/真实投递记录/);
 assert.equal(isDemoDelivery({...state,profile:{isSample:false},settings:{mode:'live'}},{source:'web'}),false);
});
