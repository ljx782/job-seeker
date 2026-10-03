import { AI_TASKS, buildMessages } from './ai-prompts.js';
import {getLocalService,localRequest} from './cloud-api.js';
export {getLocalService,initializeLocalServices,localRequest} from './cloud-api.js';
let runtimeKey='';
export function setAPIKey(value, remember=false) { runtimeKey=value.trim(); try { if(remember)sessionStorage.setItem('jobpilot.session-key',runtimeKey);else sessionStorage.removeItem('jobpilot.session-key'); }catch{} }
export function getAPIKey() { try{return runtimeKey||sessionStorage.getItem('jobpilot.session-key')||'';}catch{return runtimeKey;} }
export function clearAPIKey(){runtimeKey='';try{sessionStorage.removeItem('jobpilot.session-key');}catch{}}
/** Whether the selected provider can handle an AI request right now. */
export function aiEnabled(settings={}) {
  if(settings.provider==='qwen-local') return Boolean(getLocalService()?.configured);
  return Boolean(getAPIKey());
}
export function parseAIJSON(text) {
  const cleaned=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(cleaned);}catch{const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1));}catch{}}throw new Error('AI 返回的不是有效 JSON，请重试或检查所选模型');}
}
export function extractAIText(data,provider) {
  if(provider==='anthropic')return (data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  if(provider==='openai')return data.output_text || (data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  return data.choices?.[0]?.message?.content||'';
}
export function validateEndpoint(value) {
  let url;try{url=new URL(value);}catch{throw new Error('请输入完整的 AI 接口 URL');}
  if(url.username||url.password||url.search||url.hash)throw new Error('接口地址不能包含用户名、密码、查询参数或片段');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('远程 AI 接口必须使用 HTTPS；本机接口可使用 HTTP');
  return url.href;
}
export async function callAI(settings, task, payload, {signal,timeout=30000}={}) {
  if(!Object.hasOwn(AI_TASKS,task))throw new Error('不支持的 AI 操作');
  if(!aiEnabled(settings))throw new Error(settings.provider==='qwen-local'?'AI 服务尚未配置，请稍后重试':'请先在设置中配置 AI 服务');
  if(task!=='connection'&&!settings.consent)throw new Error('请先在设置中确认向所选 AI 服务发送本次任务所需数据');
  if(settings.provider==='qwen-local'){
    const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,getLocalService()?.hosting==='netlify'?1000000:95000);
    try{const data=await localRequest('/api/ai',{task,payload,consent:settings.consent},{signal:controller.signal});return data.result;}catch(error){if(error.name==='AbortError')throw new Error(signal?.aborted?'请求已取消':'AI 响应超时，请稍后重试');if(error instanceof TypeError)throw new Error(getLocalService()?.hosting==='netlify'?'云端 AI 连接中断，请检查网络后重试':'本机服务连接中断，请确认启动窗口仍在运行');throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  const key=getAPIKey();if(!key)throw new Error('请先在设置中填写 API Key');
  if(!settings.model.trim())throw new Error('请在设置中填写服务支持的模型名称');
  const endpoint=validateEndpoint(settings.endpoint);
  const system=buildMessages(task,payload)[0].content;
  const user=JSON.stringify(payload);let body,headers={'Content-Type':'application/json'};
  const outputLimit=['resume','resumeParse'].includes(task)?8000:4096;
  if(settings.provider==='anthropic'){headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';body={model:settings.model,system,max_tokens:outputLimit,messages:[{role:'user',content:user}]};}
  else {headers.Authorization=`Bearer ${key}`;body=settings.provider==='openai'?{model:settings.model,instructions:system,input:user,max_output_tokens:outputLimit}:{model:settings.model,messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:outputLimit};}
  const controller=new AbortController();const onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});if(!response.ok){const messages={401:'API Key 无效或已过期',403:'服务拒绝访问，请检查权限或跨域配置',404:'接口路径或模型不存在',429:'调用过于频繁或额度不足'};throw new Error(messages[response.status]||`AI 服务暂时不可用（HTTP ${response.status}）`);}const result=await response.json();const output=extractAIText(result,settings.provider);if(!output)throw new Error('AI 服务未返回文本内容，请检查模型与协议');return parseAIJSON(output);
  }catch(error){if(error.name==='AbortError')throw new Error(signal?.aborted?'已取消请求':'AI 响应超时，请稍后重试');if(error instanceof TypeError)throw new Error('无法连接 AI 服务，请检查网络、接口地址和服务端 CORS 配置');throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
