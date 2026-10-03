let localService=null,initializing=null;
export const getLocalService=()=>localService;
export function initializeLocalServices(){
  if(!initializing)initializing=loadLocalServices().finally(()=>{initializing=null;});
  return initializing;
}
async function loadLocalServices(){
  let response,data;try{response=await fetch('/api/config',{signal:AbortSignal.timeout(10000),cache:'no-store'});data=await response.json();}catch{return null;}
  if(data.hosting==='netlify'&&!response.ok)throw new Error(data.error||'云端服务尚未配置');
  if(!response.ok||typeof data.csrfToken!=='string')return null;localService=data;return data;
}
async function checked(response){if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(data?.error||'服务请求失败（HTTP '+response.status+'）');}return response;}
async function sessionFetch(path,options={}){
  const send=()=>fetch(path,{...options,headers:{...options.headers,...(options.method==='POST'?{'X-Jobseeker-Token':localService?.csrfToken}:{})},credentials:'same-origin',redirect:'error'});
  let response=await send();
  if(response.status===401&&localService?.hosting==='netlify'){await initializeLocalServices();response=await send();}
  return checked(response);
}
function pause(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});}
async function pollTask(taskId,signal){
  const until=Date.now()+1000000;
  while(Date.now()<until){await pause(2000,signal);const response=await sessionFetch('/api/tasks?id='+encodeURIComponent(taskId),{signal,cache:'no-store'});const data=await response.json();if(data.state==='done')return data.result;if(data.state==='error')throw new Error(data.error||'后台任务失败，请重试');}
  throw new Error('后台任务仍未返回结果；邮件投递请先核对回执或发件记录，勿重复发送');
}
export async function localRequest(path,payload,{signal,blob=false}={}){
  if(!localService)await initializeLocalServices();
  if(!localService){const isLocal=typeof location==='undefined'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);throw new Error(isLocal?'请使用 npm start 启动本机服务后重试':'当前线上站点尚未连接后端，此功能暂不可用。可继续手动编辑和导出 Markdown / 打印 PDF。');}
  if(path==='/api/resume/extract'&&localService.capabilities?.chunkedUploads&&typeof payload.content==='string'&&payload.content.length>2000000){
    const total=Math.ceil(payload.content.length/2000000),{uploadId}=await localRequest('/api/uploads/start',{filename:payload.filename,total},{signal});
    for(let index=0;index<total;index++)await localRequest('/api/uploads/chunk',{uploadId,index,content:payload.content.slice(index*2000000,(index+1)*2000000)},{signal});
    payload={uploadId};
  }
  const response=await sessionFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
  if(response.status===202){const task=await response.json();return pollTask(task.taskId,signal);}
  return blob?response.blob():response.json();
}
