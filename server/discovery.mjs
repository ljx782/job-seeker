import {createHash} from 'node:crypto';
import {requestQwen,ServiceError} from './ai.mjs';
import {fetchPage,publicURL} from './web.mjs';
import {readOfficialSources} from './official-sources.mjs';
const clip=(v,n=200)=>typeof v==='string'?v.trim().slice(0,n):'';
export async function searchSources(config,preferences,{signal,fetchImpl=fetch}={}){
  if(!config.key)throw new ServiceError('请先配置千问');
  const endpoint=config.baseURL.replace('/compatible-mode/v1','/api/v1/services/aigc/text-generation/generation');
  const query=[clip(preferences.query),clip(preferences.city),clip(preferences.skills),clip(preferences.employment),clip(preferences.companies),'招聘 职位 官网'].filter(Boolean).join(' ');
  const response=await fetchImpl(endpoint,{method:'POST',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,input:{messages:[{role:'user',content:`请联网检索实际存在的招聘岗位页面，优先企业招聘官网和企业在招聘系统上的职位详情。求职要求：${query}。参考当前日期 ${new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())}。不要编造岗位。简要列出结果。`}]},parameters:{enable_search:true,enable_thinking:false,search_options:{forced_search:true,enable_source:true,search_strategy:'turbo'},result_format:'message',max_tokens:1800}}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000),redirect:'error'});
  if(!response.ok)throw new ServiceError(`千问联网搜索不可用（HTTP ${response.status}），请检查模型权限或额度`,502);
  const data=await response.json(),raw=data.output?.search_info?.search_results;
  if(!Array.isArray(raw)||!raw.length)throw new ServiceError('本次搜索未返回可核验来源，请换一个职位或公司重试',502);
  const seen=new Set();return raw.flatMap(s=>{const url=publicURL(s.url);if(!url||seen.has(url))return [];seen.add(url);return [{url,title:clip(s.title,300)}];}).slice(0,12);
}
export function normalizeDiscovered(raw,sources){
  if(!Array.isArray(raw))throw new ServiceError('岗位解析结果不完整，请重试',502);
  const seen=new Set(),jobs=[];
  for(const row of raw.slice(0,20)){
    if(!row||typeof row!=='object')continue;
    const source=sources.find(s=>s.sourceIndex===row.sourceIndex),company=clip(row.company),title=clip(row.title),evidence=clip(row.evidence,500);
    if(!source?.text||!company||!title||!evidence||!source.text.includes(evidence))continue;
    const identity=`${source.url}|${company}|${title}`;if(seen.has(identity))continue;seen.add(identity);
    jobs.push({id:'web-'+createHash('sha256').update(identity).digest('hex').slice(0,20),company,title,city:clip(row.city),description:clip(row.description,5000),responsibilities:(Array.isArray(row.responsibilities)?row.responsibilities:[]).map(v=>clip(v,1000)).filter(Boolean).slice(0,10),skills:(Array.isArray(row.skills)?row.skills:[]).map(v=>clip(v,80)).filter(Boolean).slice(0,20),experience:clip(row.experience),education:clip(row.education),salaryMin:0,salaryMax:0,remote:row.remote===true,size:'',category:'联网招聘',industry:new URL(source.url).hostname,logo:company[0],tone:'sage',source:'web',url:source.url,sourceTitle:source.title,evidence,reason:clip(row.reason,500),verifiedAt:new Date().toISOString(),postedAt:'',availability:'待官网确认'});
  }return jobs;
}
export async function discoverJobs(config,preferences,{signal,search=searchSources,readPage=fetchPage,ai=requestQwen,readOfficial=readOfficialSources}={}){
  if(!clip(preferences?.query))throw new ServiceError('请填写想找的职位或公司');
  const sources=await search(config,preferences,{signal}),read=[],official=await readOfficial(preferences,sources,{signal});
  for(let i=0;i<sources.length;i+=4){const batch=await Promise.allSettled(sources.slice(i,i+4).map(s=>readPage(s.url,{signal})));batch.forEach((result,j)=>{const usable=result.status==='fulfilled'&&result.value.text?.length>=80&&!/验证码|安全验证|请稍候|登录|captcha|access denied/i.test(result.value.title);read.push({...sources[i+j],...(usable?result.value:{text:'',unavailable:true})});});}
  const seen=new Set(),all=[...official,...read].filter(s=>{if(seen.has(s.url))return false;seen.add(s.url);return true;}).map((s,sourceIndex)=>({...s,sourceIndex}));
  const usable=all.filter(s=>s.text?.length>=80).slice(0,12);let jobs=[],summary='未读取到可提取的招聘详情。你可以打开来源页面，复制具体 JD 导入。';
  if(usable.length){const result=await ai(config,'discoverJobs',{preferences,sources:usable.map(s=>({...s,text:s.text.slice(0,6500)}))},{signal});jobs=normalizeDiscovered(result.result?.jobs,usable);summary=clip(result.result?.summary,1000)||`读取了 ${usable.length} 个来源，提取出 ${jobs.length} 个候选岗位。`;}
  return {jobs,summary,sources:all.map(({url,title,unavailable})=>({url,title,readable:!unavailable})),searchedAt:new Date().toISOString(),stages:[{label:'千问联网搜索',count:sources.length},{label:'读取招聘原文',count:usable.length},{label:'提取与筛选',count:jobs.length}],disclaimer:'岗位附有本次读取的原文证据；未能读取的来源单独标记，招聘状态以官网为准。'};
}
