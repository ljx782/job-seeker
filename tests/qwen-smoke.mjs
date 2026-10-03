// Explicit opt-in smoke test. Sends only synthetic resume data through the local proxy.
import assert from 'node:assert/strict';
import {normalizeDraft,confirmedFacts} from '../js/domain.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173',config=await(await fetch(base+'/api/config')).json();
assert.ok(config.configured,'Configure Qwen before running this opt-in test');
const profile={name:'合成测试用户',role:'前端开发',summary:'使用 React 开发过本地笔记检索原型。',skills:'React, JavaScript',education:[],experience:[],projects:[]};
async function call(task,payload){const response=await fetch(base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json','X-Jobseeker-Token':config.csrfToken},body:JSON.stringify({task,payload,consent:true}),signal:AbortSignal.timeout(95000)});const result=await response.json();assert.ok(response.ok,result.error);return result;}
const resume=await call('resume',{profile,sourceFacts:[{section:'summary',text:profile.summary,sourceRef:'合成测试简介'}],job:{description:'使用 React 开发界面'}}),facts=normalizeDraft(resume.result,profile);assert.ok(facts.length);assert.equal(confirmedFacts(facts).length,0);
console.log(JSON.stringify({task:'resume',ok:true,model:resume.model,factCount:facts.length,allPending:facts.every(f=>f.status==='pending'),usage:resume.usage}));
const review=await call('resumeReview',{profile,facts,job:'React 前端工程师'});assert.equal(typeof review.result.summary,'string');assert.ok(Array.isArray(review.result.issues));console.log(JSON.stringify({task:'resumeReview',ok:true,model:review.model,issues:review.result.issues.length,usage:review.usage}));
