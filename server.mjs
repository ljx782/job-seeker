import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readConfig } from './server/config.mjs';
import { requestQwen, ServiceError } from './server/ai.mjs';
import { extractResume, buildResumeDocx } from './server/documents.mjs';
import { discoverJobs } from './server/discovery.mjs';
import { createMailboxManager } from './server/mail.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webm':'video/webm', '.ico':'image/x-icon' };
const sendJSON=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function bodyJSON(req,limit=200000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new ServiceError('请求内容过大',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ServiceError('请求必须是有效 JSON');}}
export function createServer(config,dependencies={}){
  const csrf=randomBytes(32).toString('hex'),requestAI=dependencies.requestAI||requestQwen;let activeAI=0,requestTimes=[];
  const mailbox=createMailboxManager(config,dependencies.mail||{});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');
    const port=req.socket.localPort;
    const hosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`,`[::1]:${port}`]);
    if(!hosts.has(req.headers.host)){sendJSON(res,403,{error:'仅支持本机访问'});return;}
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){sendJSON(res,403,{error:'不接受来自其他网站的请求'});return;}
    try{
      const requested=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);
      if(requested==='/api/config'&&req.method==='GET'){sendJSON(res,200,{configured:Boolean(config.key),provider:'qwen-local',model:config.model,displayName:'阿里云千问',defaultMode:config.defaultMode,setupId:'qwen-local-v1',csrfToken:csrf,capabilities:{extractResume:true,docx:true,discovery:true,mail:true,resumeSkill:'resume-tailor'}});return;}
      if(requested.startsWith('/api/')){
        if(req.method!=='POST'){sendJSON(res,405,{error:'此接口只接受 POST'});return;}
        const token=String(req.headers['x-jobseeker-token']||'');if(token.length!==csrf.length||!timingSafeEqual(Buffer.from(token),Buffer.from(csrf))){sendJSON(res,403,{error:'页面连接已过期，请刷新后重试'});return;}
        if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new ServiceError('仅支持 JSON 请求',415);
        const data=await bodyJSON(req,requested==='/api/resume/extract'?12*1024*1024:200000);
        if(requested==='/api/jobs/discover'){
          if(data.consent!==true)throw new ServiceError('请先允许千问处理求职意向',403);
          const now=Date.now();requestTimes=requestTimes.filter(t=>now-t<60000);if(activeAI>=2||requestTimes.length>=30)throw new ServiceError('当前任务较多，请稍后重试',429);requestTimes.push(now);activeAI++;
          const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
          try{sendJSON(res,200,await (dependencies.discover||discoverJobs)(config,data.preferences,{signal:controller.signal}));}finally{activeAI--;}return;
        }
        if(requested.startsWith('/api/mail/')){
          const id=data.workspaceId;let result;
          if(requested==='/api/mail/status')result=mailbox.update(id,data.applications);
          else if(requested==='/api/mail/connect'){mailbox.update(id,data.applications);result=await mailbox.connect(id,data);}
          else if(requested==='/api/mail/disconnect')result=mailbox.disconnect(id,data.accountId);
          else if(requested==='/api/mail/sync'){mailbox.update(id,data.applications);result=await mailbox.sync(id);}
          else if(requested==='/api/mail/prepare')result=await mailbox.prepare(id,data);
          else if(requested==='/api/mail/send')result=await mailbox.send(id,data.token,data.confirmed);
          else if(requested==='/api/mail/receipt')result=mailbox.receipt(id,data.token);
          else if(requested==='/api/mail/attachment'){const file=mailbox.attachment(id,data.token);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Cache-Control':'no-store'});res.end(file);return;}
          else throw new ServiceError('邮箱接口不存在',404);
          sendJSON(res,200,result);return;
        }
        if(requested==='/api/resume/extract'){sendJSON(res,200,await extractResume(data));return;}
        if(requested==='/api/resume/docx'){const file=await buildResumeDocx(data);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':'attachment; filename=resume.docx','Cache-Control':'no-store'});res.end(file);return;}
        if(requested==='/api/ai'){
          if(!data||typeof data.task!=='string'||typeof data.payload!=='object'||!data.payload)throw new ServiceError('AI 请求缺少任务或内容');
          if(data.task!=='connection'&&data.consent!==true)throw new ServiceError('请确认将本次材料发送至阿里云千问',403);
          const now=Date.now();requestTimes=requestTimes.filter(t=>now-t<60000);if(requestTimes.length>=30||activeAI>=2)throw new ServiceError('请求较多，请等当前任务结束后重试',429);requestTimes.push(now);activeAI++;
          const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
          try{const result=await requestAI(config,data.task,data.payload,{signal:controller.signal});if(!res.destroyed)sendJSON(res,200,result);}finally{activeAI--;}return;
        }
        sendJSON(res,404,{error:'接口不存在'});return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Method not allowed');return;}
      const relativeURL=requested==='/'?'/index.html':requested;if(relativeURL!=='/index.html'&&!/^\/(css|js|data|assets)\//.test(relativeURL)){res.writeHead(403);res.end('Forbidden');return;}
      const file=path.resolve(root,'.'+relativeURL),relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(p=>p.startsWith('.'))||!mime[path.extname(file)]){res.writeHead(403);res.end('Forbidden');return;}
      if(!(await stat(file)).isFile())throw new Error('Not a file');const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){if(res.destroyed||res.headersSent)return;if(error instanceof ServiceError)sendJSON(res,error.status,{error:error.message,code:error.code});else if(req.url.startsWith('/api/'))sendJSON(res,500,{error:'本机服务未能完成操作，请稍后重试'});else{res.writeHead(404);res.end('Not found');}}
  });
  server.on('close',()=>mailbox.close());return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const config=readConfig(),server=createServer(config);server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${config.port} is in use.`:'Local server could not start.');process.exitCode=1;});
  server.listen(config.port,'127.0.0.1',()=>console.log(`Jobseeker is ready: http://localhost:${config.port}\nQwen: ${config.key?'configured (key stays on local server)':'not configured'}\nPress Ctrl+C to stop.`));
}
