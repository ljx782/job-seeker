import test from 'node:test';
import assert from 'node:assert/strict';
import { matchJobBatch, normalizeJobMatches } from '../js/job-search.js';

const jobs=Array.from({length:20},(_,index)=>({id:`job-${index}`,source:index%2?'web':'demo',title:'前端工程师',company:'示例公司',skills:['React'],description:'岗位原文'}));

test('sample and web jobs share bounded AI matching with user preferences',async()=>{
  const signal=new AbortController().signal,profile={name:'测试档案'},settings={mode:'demo'};
  const result=await matchJobBatch(settings,profile,{query:'前端',city:'上海',skills:'React',employment:'校招'},jobs,{signal,request:async(s,task,payload,options)=>{
    assert.equal(s,settings);assert.equal(task,'match');assert.equal(payload.profile,profile);assert.equal(payload.preferences.city,'上海');assert.equal(options.signal,signal);
    assert.equal(payload.jobs.length,12);assert.deepEqual(payload.jobs.map(j=>j.id),jobs.slice(0,12).map(j=>j.id));
    return {matches:payload.jobs.map(j=>({id:j.id,score:91,analysis:'React 技能与岗位要求相关'})),strategy:'优先查看前端机会'};
  }});
  assert.equal(result.matches.length,12);assert.ok(result.matches.every(([,match])=>match.source==='ai'));assert.equal(result.strategy,'优先查看前端机会');
});

test('AI scores cannot add unknown jobs, duplicate IDs or missing scores',()=>{
  const result=normalizeJobMatches(jobs.slice(0,2),{matches:[{id:'job-0',score:120,analysis:'匹配理由'},{id:'job-0',score:10,analysis:'重复'},{id:'invented',score:99,analysis:'虚构'},{id:'job-1',score:null,analysis:'没有评分'}]});
  assert.deepEqual(result.map(([id,match])=>[id,match.score]),[['job-0',100]]);
  assert.throws(()=>normalizeJobMatches(jobs,{matches:[{id:'job-0',score:'',analysis:'无效'}]}),/没有返回可用/);
});

test('matching errors propagate without substituting rule scores',async()=>{
  const error=new Error('服务额度不足');
  await assert.rejects(matchJobBatch({}, {}, {}, jobs, {request:async()=>{throw error;}}),value=>value===error);
  await assert.rejects(matchJobBatch({}, {}, {}, jobs, {request:async()=>({matches:[]})}),/没有返回可用/);
});

test('empty filtered results skip AI requests',async()=>{
  assert.deepEqual(await matchJobBatch({}, {}, {}, [], {request:()=>{throw new Error('不应调用');}}),{matches:[],strategy:''});
});
