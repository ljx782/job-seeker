import { normalizeProfile, SECTION_IDS } from './resume-schema.js';
import { demoProfile, demoApplications, demoMaterials, DEMO_REVISION } from './demo-content.js';
import { normalizeAgent } from './agent-state.js';
import { uid, localDate } from './utils.js';
import { STAGES, profileFacts } from './domain.js';

const KEY='jobpilot.workspace.v1';
export const DEFAULT_SETTINGS={mode:'live',provider:'qwen-local',endpoint:'',model:'',theme:'light',consent:false};
export function sampleProfile() { return demoProfile(); }
export function initialState(jobs, seeded=true) {
  const profile=normalizeProfile(seeded?sampleProfile():{});
  const now=new Date();
  const applications=seeded?demoApplications(jobs,now):[];
  return {schemaVersion:1,demoRevision:seeded?DEMO_REVISION:0,agent:normalizeAgent(),profile,applications,studio:{view:'library',materials:seeded?demoMaterials(now):[],messages:[]},customJobs:[],settings:{...DEFAULT_SETTINGS},preferences:{discoveryMode:seeded?'demo':'web',query:'',skills:'',city:'',salary:'',size:'',category:'',remote:false,tab:'all',sort:'match'},resume:{template:'tech',targetJobId:seeded?(jobs.find(j=>j.source==='demo'&&j.category==='前端')?.id||''):'',customJD:'',facts:profileFacts(profile),generated:false},updatedAt:now.toISOString()};
}
const text=(value,max=10000)=>typeof value==='string'?value.slice(0,max):'';
const validDate=value=>typeof value==='string' && !Number.isNaN(Date.parse(value));
export function validateBackup(input) {
  if(!input||input.schemaVersion!==1||!input.profile||!Array.isArray(input.applications)||!Array.isArray(input.customJobs))throw new Error('备份格式不正确，请选择 Jobseeker 导出的 JSON 文件');
  if(input.applications.length>2000||input.customJobs.length>2000)throw new Error('备份记录过多，单次最多导入 2000 条');
  const profile=normalizeProfile(input.profile);
  const seen=new Set();
  const applications=input.applications.map(app=>{
    if(!app||!text(app.id)||seen.has(app.id)||!text(app.company)||!text(app.title)||!STAGES.some(s=>s.id===app.status))throw new Error('投递记录含有无效字段、重复 ID 或未知状态');
    seen.add(app.id);const result={};for(const key of ['id','jobId','company','title','city','category','channel','notes','resumeVersion','applicationUrl','recipient','deliveryId','deliveryState'])result[key]=text(app[key]);
    result.status=app.status;for(const key of ['createdAt','updatedAt','appliedAt','interviewAt','offerDeadline']){if(app[key]&&!validDate(app[key]))throw new Error('投递记录包含无效日期');result[key]=app[key]||null;}
    if(!Array.isArray(app.history))throw new Error('投递记录缺少状态历史');
    result.history=app.history.slice(-500).map(h=>{if(!STAGES.some(s=>s.id===h.status)||!validDate(h.at))throw new Error('状态历史格式不正确');return{status:h.status,at:h.at};});result.isSample=Boolean(app.isSample);return result;
  });
  const jobIds=new Set();
  const customJobs=input.customJobs.map(job=>{
    if(!job||!text(job.id)||jobIds.has(job.id)||!text(job.company)||!text(job.title)||!Array.isArray(job.skills))throw new Error('导入岗位数据不完整');
    jobIds.add(job.id);const result={};for(const key of ['id','company','title','city','size','category','description','experience','education','industry','url','logo','tone','sourceTitle','evidence','reason','verifiedAt','availability'])result[key]=text(job[key]);
    result.tone=['sage','peach','lilac','blue','rose','sand'].includes(result.tone)?result.tone:'sage';result.skills=job.skills.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,100));result.responsibilities=(Array.isArray(job.responsibilities)?job.responsibilities:[]).filter(x=>typeof x==='string').slice(0,20);result.salaryMin=Math.max(0,Number(job.salaryMin)||0);result.salaryMax=Math.max(result.salaryMin,Number(job.salaryMax)||0);result.remote=Boolean(job.remote);result.source=job.source==='web'?'web':'manual';result.postedAt=validDate(job.postedAt)?job.postedAt:(job.source==='web'?'':new Date().toISOString());return result;
  });
  const settings={...DEFAULT_SETTINGS};for(const key of ['mode','provider','endpoint','model','theme','localSetupId'])if(typeof input.settings?.[key]==='string')settings[key]=input.settings[key].slice(0,500);settings.mode='live';settings.provider=['openai','compatible','anthropic','qwen-local'].includes(settings.provider)?settings.provider:'qwen-local';settings.theme=settings.theme==='dark'?'dark':'light';settings.consent=Boolean(input.settings?.consent);
  const resume={template:['tech','product','design','general'].includes(input.resume?.template)?input.resume.template:'tech',targetJobId:text(input.resume?.targetJobId),customJD:text(input.resume?.customJD),instruction:text(input.resume?.instruction,2000),generated:Boolean(input.resume?.generated),facts:[]};
  if(input.resume?.facts&&!Array.isArray(input.resume.facts))throw new Error('简历内容格式不正确');
  resume.facts=(input.resume?.facts||profileFacts(profile)).slice(0,100).map(f=>{
    if(!SECTION_IDS.includes(f.section)||!['USER','AI-INFER','AI-SUGGEST'].includes(f.source)||!['pending','accepted','rejected'].includes(f.status))throw new Error('简历事实标记格式不正确');
    return {id:uid(),section:f.section,text:text(f.text),source:f.source,sourceRef:text(f.sourceRef),originalText:text(f.originalText),status:f.source==='AI-SUGGEST'?'pending':f.status};
  });
  const prefs=input.preferences||{};const preferences={};for(const key of ['query','skills','city','salary','size','category','tab','sort','companies','employment'])preferences[key]=text(prefs[key],200);preferences.remote=Boolean(prefs.remote);preferences.discoveryMode=['demo','web'].includes(prefs.discoveryMode)?prefs.discoveryMode:(profile.isSample?'demo':'web');
  const versions=Array.isArray(input.versions)?input.versions.slice(0,100).map(v=>{if(!v||typeof v.id!=='string'||typeof v.name!=='string'||!validDate(v.savedAt)||!v.profile||!Array.isArray(v.facts))throw new Error('简历版本格式不正确');const verified=validateBackup({schemaVersion:1,profile:v.profile,applications:[],customJobs:[],resume:{facts:v.facts,template:v.template}});return {id:v.id,name:v.name.slice(0,200),savedAt:v.savedAt,profile:verified.profile,facts:v.kind==='draft'?verified.resume.facts:verified.resume.facts.filter(f=>f.status==='accepted'&&f.source!=='AI-SUGGEST'),template:verified.resume.template,targetJobId:text(v.targetJobId),customJD:text(v.customJD),instruction:text(v.instruction,2000),kind:['original','ai','manual','draft'].includes(v.kind)?v.kind:'manual',sourceText:text(v.sourceText,100000),sourceFilename:text(v.sourceFilename,200),deletedAt:validDate(v.deletedAt)?v.deletedAt:null,order:Number.isFinite(v.order)?v.order:0};}):[];
  const studio={view:['library','materials','editor','coach'].includes(input.studio?.view)?input.studio.view:'library',materials:[],messages:[]};
  studio.materials=(Array.isArray(input.studio?.materials)?input.studio.materials:[]).slice(0,50).map(m=>({id:text(m.id,100)||uid(),title:text(m.title,200),text:text(m.text,8000),section:SECTION_IDS.includes(m.section)?m.section:'projects',savedAt:validDate(m.savedAt)?m.savedAt:new Date().toISOString()}));
  studio.messages=(Array.isArray(input.studio?.messages)?input.studio.messages:[]).slice(-30).filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,text:text(m.text,10000),suggestedFacts:(Array.isArray(m.suggestedFacts)?m.suggestedFacts:[]).slice(0,3).filter(f=>SECTION_IDS.includes(f.section)).map(f=>({section:f.section,text:text(f.text),source:f.source==='AI-SUGGEST'?'AI-SUGGEST':'AI-INFER',sourceRef:text(f.sourceRef)}))}));
  return {schemaVersion:1,demoRevision:Number(input.demoRevision)||0,agent:normalizeAgent(input.agent),profile,applications,customJobs,settings,preferences,resume,studio,updatedAt:new Date().toISOString(),versions};
}
export function createStore(jobs) {
  let state;
  try{const saved=localStorage.getItem(KEY);state=saved?validateBackup(JSON.parse(saved)):initialState(jobs);}catch(error){state=initialState(jobs);queueMicrotask(()=>window.dispatchEvent(new CustomEvent('jp:storage-error',{detail:'本地数据无法读取，已加载演示工作区。原始存储未被覆盖，请先导出或检查浏览器存储。'})));}
  const save=()=>{state.updatedAt=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{window.dispatchEvent(new CustomEvent('jp:storage-error',{detail:'浏览器存储不可用或空间不足。当前操作只保留在内存中，请及时导出备份。'}));return false;}};
  return {get state(){return state;},save,replace(next){const previous=state;state=next;const success=save();if(!success)state=previous;return success;},reset(seed=true){const next=initialState(jobs,seed);next.settings={...next.settings,...state.settings,mode:'live'};return this.replace(next);}};
}
function openDB(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('当前浏览器不支持版本存储'));const req=indexedDB.open('jobpilot-resumes',1);req.onupgradeneeded=()=>req.result.createObjectStore('versions',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('无法打开简历版本库，请检查浏览器隐私设置'));});}
export async function versionAction(action,value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('versions',action==='getAll'?'readonly':'readwrite');const store=tx.objectStore('versions');let request;if(action==='replaceAll'){store.clear();for(const version of value)store.put(version);}else request=store[action](value);tx.oncomplete=()=>{const result=request?.result;db.close();resolve(result);};tx.onerror=()=>{db.close();reject(new Error('简历版本保存失败，请导出 Markdown 备份'));};tx.onabort=()=>{db.close();reject(new Error('简历版本操作被中断'));};});}
export async function allVersions({includeTrash=false}={}){const versions=await versionAction('getAll');return versions.filter(v=>includeTrash||!v.deletedAt).sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt));}
