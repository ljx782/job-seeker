import { resumeFilename } from '../js/resume-schema.js';
import {ImapFlow} from 'imapflow';
import {simpleParser} from 'mailparser';
import nodemailer from 'nodemailer';
import {randomUUID,createHash} from 'node:crypto';
import {ServiceError,requestQwen} from './ai.mjs';
import {buildResumeDocx} from './documents.mjs';
import {confirmedFacts} from '../js/domain.js';

export const MAIL_PROVIDERS={qq:{name:'QQ 邮箱',imap:'imap.qq.com',smtp:'smtp.qq.com',domains:['qq.com','foxmail.com']},netease:{name:'163 邮箱',imap:'imap.163.com',smtp:'smtp.163.com',domains:['163.com']}};
const str=(v,n=200)=>typeof v==='string'?v.trim().slice(0,n):'';
const email=v=>/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)&&v.length<255;
export function mailCredentials(data){const provider=MAIL_PROVIDERS[data.provider],address=str(data.email,254).toLowerCase(),password=str(data.password,200);if(!provider||!email(address)||!provider.domains.includes(address.split('@')[1]))throw new ServiceError('邮箱地址与所选 QQ / 163 服务不匹配');if(!password)throw new ServiceError('请输入邮箱 IMAP/SMTP 授权码');if(data.consent!==true)throw new ServiceError('请同意读取招聘邮件摘要并交给千问识别',403);return {provider:data.provider,email:address,password};}
function imapClient(account){return new ImapFlow({host:MAIL_PROVIDERS[account.provider].imap,port:993,secure:true,auth:{user:account.email,pass:account.password},logger:false,disableAutoIdle:true,clientInfo:{name:'Jobseeker',version:'1.0',vendor:'Jobseeker'},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});}
function smtpClient(account){return nodemailer.createTransport({host:MAIL_PROVIDERS[account.provider].smtp,port:465,secure:true,auth:{user:account.email,pass:account.password},logger:false,debug:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:25000,disableFileAccess:true,disableUrlAccess:true});}
export async function readRecruitmentMail(account,applications,{clientFactory=imapClient,maxMessages=50}={}){
  const client=clientFactory(account);client.on('error',()=>{});let lock;
  try{
    await client.connect();lock=await client.getMailboxLock('INBOX',{readOnly:true});const validity=String(client.mailbox.uidValidity),same=account.validity===validity;
    const uids=await client.search(same&&account.cursor?{uid:`${account.cursor+1}:*`}:{since:new Date(Date.now()-7*86400000)},{uid:true});
    const selected=uids.filter(id=>!same||id>(account.cursor||0)).sort((a,b)=>a-b).slice(0,maxMessages),messages=[];
    for(const id of selected){const item=await client.fetchOne(id,{envelope:true,size:true},{uid:true});if(!item)continue;const subject=str(item.envelope?.subject,500),from=str(item.envelope?.from?.map(v=>v.address).join(', '),300);
      if(!/招聘|应聘|简历|面试|笔试|录用|offer|interview|application|assessment|recruit|hiring/i.test(subject+' '+from)&&!applications.some(a=>a.company&&subject.includes(a.company)))continue;
      if(item.size>300000)continue;
      const full=await client.fetchOne(id,{source:{maxLength:300000}},{uid:true});if(!full?.source)continue;const parsed=await simpleParser(full.source,{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true});const text=str(parsed.text,10000);
      messages.push({id:createHash('sha256').update(account.email+'|'+validity+'|'+id).digest('hex'),subject,from,text,receivedAt:parsed.date?.toISOString()||new Date().toISOString()});
    }
    return {messages,cursor:selected.at(-1)||(same?account.cursor||0:0),validity,checked:selected.length};
  }finally{lock?.release();await client.logout().catch(()=>client.close());}
}
export function normalizeMailEvents(raw,messages,applications,accountId){
  if(!Array.isArray(raw))throw new ServiceError('AI 邮件识别结果不完整，请重试',502);
  const statuses=['applied','screening','test','interview','offer','rejected','unknown'],seen=new Set();
  return raw.flatMap(row=>{if(!row||typeof row!=='object')return [];const mail=messages.find(m=>m.id===row.mailId),evidence=str(row.evidence,600);if(!mail||seen.has(mail.id)||!evidence||!(mail.subject+'\n'+mail.text).includes(evidence))return [];seen.add(mail.id);const matched=applications.find(a=>a.id===row.applicationId);return [{id:mail.id,accountId,applicationId:matched?.id||'',status:statuses.includes(row.status)?row.status:'unknown',summary:str(row.summary,1000)||mail.subject,evidence,subject:mail.subject,from:mail.from,receivedAt:mail.receivedAt,eventAt:typeof row.eventAt==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(row.eventAt)&&Number.isFinite(Date.parse(row.eventAt))?row.eventAt:'',confidence:Math.max(0,Math.min(1,Number(row.confidence)||0)),review:'pending'}];});
}
export function createMailboxManager(config,{readMail=readRecruitmentMail,ai=requestQwen,verify=async account=>{const client=imapClient(account);client.on('error',()=>{});try{await client.connect();await client.mailboxOpen('INBOX',{readOnly:true});}finally{await client.logout().catch(()=>client.close());}},sendMail=async(account,message)=>smtpClient(account).sendMail(message),interval=120000,autoSync=true,initialState=null,checkpoint=async()=>{}}={}){
  const workspaces=new Map(),drafts=new Map();
  for(const [id,w] of initialState?.workspaces||[])workspaces.set(id,{...w,accounts:new Map(w.accounts.map(([key,a])=>[key,{...a,syncing:false}]))});
  for(const [id,d] of initialState?.drafts||[])drafts.set(id,{...d,attachment:Buffer.from(d.attachment,'base64')});
  const snapshot=()=>({workspaces:[...workspaces].map(([id,w])=>[id,{...w,accounts:[...w.accounts].map(([key,a])=>[key,{...a,syncing:false}])}]),drafts:[...drafts].map(([id,d])=>[id,{...d,attachment:d.attachment.toString('base64')}])});
  const workspace=id=>{if(!/^[a-zA-Z0-9-]{20,100}$/.test(id||''))throw new ServiceError('工作区标识无效');if(!workspaces.has(id)){if(workspaces.size>=20)throw new ServiceError('工作区连接过多，请重启本机服务');workspaces.set(id,{accounts:new Map(),applications:[],events:[]});}return workspaces.get(id);};
  const status=id=>{const w=workspace(id);return {accounts:[...w.accounts.values()].map(a=>({id:a.id,provider:a.provider,email:a.email,lastSync:a.lastSync||'',error:a.error||'',syncing:!!a.syncing})),events:w.events};};
  async function syncAccount(w,a){if(a.syncing)return;a.syncing=true;try{const data=await readMail(a,w.applications);if(!w.accounts.has(a.id))return;const events=[];for(let i=0;i<data.messages.length;i+=8){const messages=data.messages.slice(i,i+8);const result=await ai(config,'mailProgress',{messages,applications:w.applications});events.push(...normalizeMailEvents(result.result?.events,messages,w.applications,a.id));}if(!w.accounts.has(a.id))return;const known=new Set(w.events.map(e=>e.id));w.events.push(...events.filter(e=>!known.has(e.id)));w.events=w.events.slice(-300);a.cursor=data.cursor;a.validity=data.validity;a.lastSync=new Date().toISOString();a.error='';}catch{a.error='收信或 AI 识别失败，请检查授权码、IMAP 服务、网络及千问额度后重试。';}finally{a.syncing=false;}}
  const timer=interval>0?setInterval(()=>{for(const w of workspaces.values())for(const a of w.accounts.values())void syncAccount(w,a);},interval):null;timer?.unref();
  return {
    close(){clearInterval(timer);workspaces.clear();drafts.clear();},status,snapshot,
    update(id,applications){const w=workspace(id);w.applications=(Array.isArray(applications)?applications:[]).filter(a=>!a.isSample).slice(0,200).map(a=>({id:str(a.id,100),company:str(a.company),title:str(a.title),status:str(a.status),appliedAt:str(a.appliedAt)}));return status(id);},
    async connect(id,data){if(!config.key)throw new ServiceError('请先配置千问以识别招聘邮件');const credentials=mailCredentials(data),w=workspace(id);if(w.accounts.size>=4&&!w.accounts.has(credentials.email))throw new ServiceError('每个工作区最多连接 4 个邮箱');try{await verify(credentials);}catch{throw new ServiceError('连接失败：请在邮箱设置开启 IMAP，并使用授权码而非登录密码。163 邮箱也需允许第三方客户端登录。',502);}const prior=w.accounts.get(credentials.email);w.accounts.set(credentials.email,{...prior,...credentials,id:credentials.email});if(autoSync)void syncAccount(w,w.accounts.get(credentials.email));return status(id);},
    disconnect(id,accountId){workspace(id).accounts.delete(accountId);return status(id);},
    async sync(id){const w=workspace(id);for(const a of w.accounts.values())await syncAccount(w,a);return status(id);},
    async prepare(id,data){const w=workspace(id),account=w.accounts.get(data.accountId);if(!account)throw new ServiceError('先连接用于发送简历的邮箱');if(data.profile?.isSample||data.job?.source==='demo')throw new ServiceError('示例档案与演示岗位不能真实投递，请先填写真实资料');if(!email(str(data.to,254)))throw new ServiceError('请填写单个招聘收件邮箱');if(!str(data.subject,200)||!str(data.text,10000))throw new ServiceError('请填写邮件标题和正文');const facts=confirmedFacts(data.resume?.facts||[]);if(!facts.length||(data.resume?.facts||[]).some(f=>f.status==='pending'))throw new ServiceError('请先核实或移除所有待确认条目，再准备投递');const attachment=await buildResumeDocx({profile:data.profile,resume:{...data.resume,facts}});const token=randomUUID(),filename=resumeFilename(data.profile,'docx');
      for(const [key,draft] of drafts)if(Date.now()-draft.createdAt>3600000&&draft.state==='prepared')drafts.delete(key);if(drafts.size>=100)throw new ServiceError('投递草稿过多，请重启服务后重试');
      const preview={from:account.email,to:str(data.to,254),subject:str(data.subject,200).replace(/[\r\n]/g,' '),text:str(data.text,10000),filename};drafts.set(token,{workspaceId:id,accountId:account.id,preview,attachment,state:'prepared',createdAt:Date.now(),jobId:str(data.job?.id,100)});return {token,...preview,attachmentBytes:attachment.length};},
    attachment(id,token){const d=drafts.get(token);if(!d||d.workspaceId!==id)throw new ServiceError('投递草稿不存在');return d.attachment;},
    async send(id,token,confirmed){const d=drafts.get(token);if(!d||d.workspaceId!==id)throw new ServiceError('投递草稿已失效，请核对发件箱后重新准备');if(confirmed!==true)throw new ServiceError('请先确认收件人、正文和简历附件',403);if(d.state==='sent')return d.receipt;if(d.state!=='prepared')throw new ServiceError('此投递正在发送或结果不确定，请检查发件箱和投递手账，勿重复发送',409);if(Date.now()-d.createdAt>3600000)throw new ServiceError('投递预览已过期，请重新准备');const account=workspace(id).accounts.get(d.accountId);if(!account)throw new ServiceError('发送邮箱已断开');d.state='sending';await checkpoint(snapshot());
      try{const info=await sendMail(account,{from:d.preview.from,to:d.preview.to,subject:d.preview.subject,text:d.preview.text,messageId:`<${token}@jobseeker.local>`,attachments:[{filename:d.preview.filename,content:d.attachment,contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]});if(!info.accepted?.some(v=>String(v).toLowerCase()===d.preview.to.toLowerCase()))throw new Error('Not accepted');d.receipt={status:'sent',messageId:info.messageId||token,sentAt:new Date().toISOString(),to:d.preview.to,from:d.preview.from,token,jobId:d.jobId};d.state='sent';await checkpoint(snapshot());return d.receipt;}catch{d.state='uncertain';await checkpoint(snapshot());throw new ServiceError('邮件发送未能确认。请核对邮箱发件记录或收件方反馈，再决定是否重新投递；本次不会自动重发。',502);}},
    receipt(id,token){const d=drafts.get(token);if(!d||d.workspaceId!==id)return {status:'unknown'};return d.receipt||{status:d.state};}
  };
}
