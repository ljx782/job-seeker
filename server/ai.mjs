import { buildMessages } from '../js/ai-prompts.js';
import { parseAIJSON, extractAIText } from '../js/api.js';
import { applyTaskSkill } from './skills.mjs';
export class ServiceError extends Error{constructor(message,status=400,code='REQUEST_ERROR'){super(message);this.status=status;this.code=code;}}
const RETRY_DELAY_MS=500;
const NETWORK_CODES=new Set(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH']);
const logNetworkFailure=error=>console.warn(`[qwen] network failure name=${['Error','TypeError'].includes(error?.name)?error.name:'unknown'} cause=${NETWORK_CODES.has(error?.cause?.code)?error.cause.code:'unknown'}`);
function retryPause(signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}const cleanup=()=>signal.removeEventListener('abort',onAbort),timer=setTimeout(()=>{cleanup();resolve();},RETRY_DELAY_MS),onAbort=()=>{clearTimeout(timer);cleanup();reject(new DOMException('Aborted','AbortError'));};signal.addEventListener('abort',onAbort,{once:true});});}
export async function requestQwen(config,task,payload,{signal,fetchImpl=fetch,timeout=90000}={}){
  if(!config.key)throw new ServiceError('本机尚未配置千问密钥，请设置 DASHSCOPE_API_KEY',503,'NOT_CONFIGURED');
  let messages;try{messages=applyTaskSkill(task,buildMessages(task,payload));}catch{throw new ServiceError('不支持的 AI 操作');}
  if(JSON.stringify(payload).length>100000)throw new ServiceError('内容过长，本次材料最多支持 10 万字符',413);
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,timeout);
  try{
    const request={method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:JSON.stringify({model:config.model,messages,enable_thinking:false,response_format:{type:'json_object'},temperature:task==='resumeParse'?.1:.4,max_tokens:task==='connection'?100:['resume','resumeParse'].includes(task)?8000:4500}),signal:controller.signal,redirect:'error'};
    let response;
    for(let attempt=0;attempt<2;attempt++){
      controller.signal.throwIfAborted();
      try{response=await fetchImpl(`${config.baseURL}/chat/completions`,request);break;}
      catch(error){
        if(error?.name==='AbortError')throw error;
        controller.signal.throwIfAborted();
        if(!(error instanceof TypeError)&&!NETWORK_CODES.has(error?.cause?.code))throw error;
        logNetworkFailure(error);
        if(attempt===0&&!controller.signal.aborted){await retryPause(controller.signal);continue;}
        throw new ServiceError('无法连接阿里云千问，请检查网络及服务地址',502,'NETWORK_ERROR');
      }
    }
    if(!response.ok){let upstream={};try{upstream=await response.json();}catch{}const code=String(upstream.error?.code||upstream.code||'').slice(0,100);const messagesByStatus={401:'千问密钥无效或与地域不匹配，请检查控制台 API Key 与地域',403:'千问拒绝访问，请检查业务空间或模型权限',404:'千问接口或模型不存在，请核对模型与业务空间域名',429:'千问额度不足或请求过于频繁，请检查额度并稍后重试'};throw new ServiceError(messagesByStatus[response.status]||`千问服务返回错误（HTTP ${response.status}）`,[401,403].includes(response.status)?502:response.status,code||'UPSTREAM_ERROR');}
    const data=await response.json(),output=extractAIText(data,'compatible');if(!output)throw new ServiceError('千问没有返回可用内容',502,'EMPTY_RESPONSE');
    let result;try{result=parseAIJSON(output);}catch{throw new ServiceError('千问返回格式不完整，请重试',502,'INVALID_JSON');}
    return{result,model:config.model,usage:{inputTokens:data.usage?.prompt_tokens||0,outputTokens:data.usage?.completion_tokens||0},requestId:response.headers?.get('x-request-id')||data.id||''};
  }catch(error){if(error instanceof ServiceError)throw error;if(error.name==='AbortError')throw new ServiceError(signal?.aborted?'请求已取消':'千问响应超时，请稍后重试',504,'TIMEOUT');throw new ServiceError('无法连接阿里云千问，请检查网络及服务地址',502,'NETWORK_ERROR');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
