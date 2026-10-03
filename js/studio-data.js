import { uid } from './utils.js';
import { normalizeDraft, profileFacts } from './domain.js';
import { versionAction, validateBackup } from './storage.js';
import {resumeChecklist} from './resume-schema.js';

export const studioViews=[['library','简历库','board'],['materials','个人素材','list'],['editor','编辑与定制','edit'],['coach','AI 顾问','sparkle']];
export function studioState(state){return state.studio??={view:'library',materials:[],messages:[]};}
export function safeProfile(value){return validateBackup({schemaVersion:1,profile:value||{},applications:[],customJobs:[]}).profile;}
export async function archiveDraft(ctx){
  const {profile,resume}=ctx.store.state;
  if(!profile.name&&!resume.facts.length)return;
  await versionAction('put',{id:uid(),name:`${profile.name||'未命名'} · 自动保留草稿`,kind:'draft',savedAt:new Date().toISOString(),profile:structuredClone(profile),...structuredClone(resume)});
}
export function appendSuggestions(ctx,raw){
  const state=ctx.store.state,facts=normalizeDraft({facts:raw},state.profile);
  const existing=new Set(state.resume.facts.map(f=>f.text));
  const additions=facts.filter(f=>!existing.has(f.text));
  state.resume.facts.push(...additions);state.resume.generated=true;ctx.save();return additions.length;
}
export function localReview(profile,resume){
  const facts=resume.facts||[],issues=[];
  for(const check of resumeChecklist(profile).filter(c=>!c.done))issues.push({section:check.id,title:check.label+'待完善',evidence:check.hint,suggestion:check.hint+'，没有的数据请留空。'});
  if(!profile.email&&!profile.phone)issues.push({section:'basic',title:'补充联系方式',evidence:'邮箱和电话均未填写',suggestion:'填写可以接收招聘通知的联系方式。'});
  if(!facts.some(f=>f.section==='experience'||f.section==='projects'))issues.push({section:'experience',title:'缺少经历证据',evidence:'没有工作或项目内容',suggestion:'添加一个真实项目，说明你的任务、行动与结果。'});
  if(facts.some(f=>f.status==='pending'))issues.push({section:'review',title:'还有待核实内容',evidence:'当前草稿有未确认条目',suggestion:'在编辑器中逐条核对，只有已确认内容才会导出。'});
  return {summary:'本地基础检查已完成。使用 AI 诊断可获得结合内容与岗位的具体建议。',strengths:facts.length?['已有可整理的简历素材']:[],issues,keywords:{matched:[],missing:[]},nextSteps:['核对每一项经历，补充可验证的行动和成果。']};
}
export function draftFromProfile(profile,previous={}){return {...previous,template:previous.template||'tech',targetJobId:'',customJD:'',instruction:'',generated:false,facts:profileFacts(profile)};}
