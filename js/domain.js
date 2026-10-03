import { SECTION_IDS, SECTION_LABELS, entryText, profileSkillText, resumeChecklist } from './resume-schema.js';
import { polishDemoText } from './demo-content.js';
import { clamp, splitSkills, uid, localDate } from './utils.js';

export const STAGES = [
  {id:'saved',label:'待投递',color:'#a19683'}, {id:'applied',label:'已投递',color:'#7491a2'},
  {id:'screening',label:'简历筛选',color:'#8b87ac'}, {id:'test',label:'笔试',color:'#b69560'},
  {id:'interview',label:'面试',color:'#d9944d'}, {id:'offer',label:'Offer',color:'#72917a'},
  {id:'rejected',label:'已结束',color:'#b98a8a'}
];
export const stageLabel = id => STAGES.find(s=>s.id===id)?.label || '未知状态';
const normalized = value => String(value||'').toLowerCase().replace(/[\s.\-]/g,'');
const aliases = { js:'javascript', ts:'typescript', 'vuejs':'vue', 'reactjs':'react', 'nodejs':'node', '人工智能':'ai', '前端开发':'前端', '前端工程师':'前端', '产品经理':'产品' };
const canon = value => aliases[normalized(value)] || normalized(value);
export function matchJob(job, preferences={}, profile={}) {
  const skills = splitSkills(preferences.skills || profileSkillText(profile));
  const title = preferences.query?.trim() || profile.role || '';
  const matched = job.skills.filter(skill=>skills.some(own=>canon(own)===canon(skill)));
  const missing = job.skills.filter(skill=>!matched.includes(skill));
  const words = title.split(/[\s,，、]+/).filter(Boolean);
  const haystack = `${job.title} ${job.company} ${job.category} ${job.skills.join(' ')} ${job.description}`.toLowerCase();
  const relevant = words.length ? words.some(word=>haystack.includes(word.toLowerCase()) || normalized(job.title).includes(canon(word)) || canon(word)===canon(job.category)) : true;
  const locationMatch = !preferences.city || preferences.city==='全部城市' || job.city===preferences.city || (preferences.city==='远程' && job.remote);
  const score = clamp(Math.round(28 + (job.skills.length ? matched.length/job.skills.length*43 : 0) + (relevant?19:0) + (locationMatch?10:0)), 0, 99);
  return { score, matched, missing, relevant, locationMatch, analysis: matched.length ? `你的 ${matched.slice(0,3).join('、')} 与岗位要求契合${missing.length ? `；可进一步补充 ${missing.slice(0,2).join('、')} 的相关经历。` : '，值得深入了解。'}` : '目前档案中的技能与岗位交集较少，可以先查看要求，再判断是否适合。' };
}
export function filterJobs(jobs, preferences, profile, savedIds=[]) {
  const words = String(preferences.query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list=jobs.map(job=>({...job,match:matchJob(job,preferences,profile)})).filter(job=>{
    const haystack=`${job.title} ${job.company} ${job.category} ${job.skills.join(' ')} ${job.description}`.toLowerCase();
    return (!words.length || words.every(w=>haystack.includes(w))) && job.match.locationMatch &&
      (!preferences.salary || job.salaryMax>=Number(preferences.salary)) &&
      (!preferences.size || job.size===preferences.size) && (!preferences.category || job.category===preferences.category) &&
      (!preferences.remote || job.remote) && (preferences.tab!=='saved' || savedIds.includes(job.id)) &&
      (preferences.tab!=='recommended' || job.match.score>=70);
  });
  return list.sort((a,b)=>preferences.sort==='salary'?b.salaryMax-a.salaryMax:preferences.sort==='newest'?new Date(b.postedAt)-new Date(a.postedAt):b.match.score-a.match.score || b.salaryMax-a.salaryMax);
}
export function transition(application, status, at=new Date().toISOString()) {
  if (!STAGES.some(stage=>stage.id===status)) throw new Error('无效的投递状态');
  if (application.status===status) return application;
  return {...application,status,updatedAt:at,appliedAt:application.appliedAt || (status!=='saved'?at:null),history:[...(application.history||[]),{status,at}]};
}
export function reminders(applications, now=new Date()) {
  const time=+new Date(now), day=86400000;
  return applications.flatMap(app=>{
    const result=[];
    if(app.status==='applied' && app.appliedAt && time-new Date(app.appliedAt)>=3*day) result.push({id:`follow-${app.id}`,applicationId:app.id,kind:'followup',title:`跟进 ${app.company}`,text:`投递 ${Math.floor((time-new Date(app.appliedAt))/day)} 天了，可以礼貌询问进展。`});
    if(app.status==='interview'&&app.interviewAt){const diff=new Date(app.interviewAt)-time;if(diff>=0&&diff<=day)result.push({id:`interview-${app.id}`,applicationId:app.id,kind:'interview',title:`准备 ${app.company} 的面试`,text:'面试将在 24 小时内开始，复盘项目、检查设备。'});}
    if(app.status==='offer'&&app.offerDeadline){const diff=new Date(app.offerDeadline)-time;if(diff<=2*day)result.push({id:`offer-${app.id}`,applicationId:app.id,kind:'offer',title:`${app.company} · Offer 截止${diff<0?'已过':'临近'}`,text:diff<0?'确认是否已经答复，并及时更新备注。':'距离答复截止不到 48 小时，请确认决定。'});}
    return result;
  });
}
export function funnel(applications) {
  const levels=['applied','screening','test','interview','offer'];
  const counts=levels.map((status,index)=>({status,label:stageLabel(status),count:applications.filter(app=>{
    const reached=[...(app.history||[]).map(h=>h.status),app.status];
    return Math.max(-1,...reached.map(s=>levels.indexOf(s)))>=index || (index===0&&Boolean(app.appliedAt));
  }).length}));
  return counts.map((entry,index)=>({...entry,rate:index===0?(entry.count?100:0):(counts[index-1].count?Math.round(entry.count/counts[index-1].count*100):0)}));
}
export function timeline(applications, days=14, now=new Date()) {
  return Array.from({length:days},(_,i)=>{ const d=new Date(now);d.setDate(d.getDate()-(days-i-1)); const day=localDate(d); return {date:day,count:applications.filter(app=>app.appliedAt&&localDate(app.appliedAt)===day).length}; });
}
export function profileCompleteness(profile) {
  const checks=resumeChecklist(profile);return Math.round(checks.filter(c=>c.done).length/checks.length*100);
}
export function profileFacts(profile) {
  const facts=[];
  const add=(section,text,ref)=>{if(String(text||'').trim())facts.push({id:uid(),section,text:String(text).trim(),source:'USER',sourceRef:ref,status:'accepted'});};
  add('summary',profile.summary,'个人信息 / 个人简介');
  for(const section of ['experience','projects','education','competitions','research','credentials'])
    (profile[section]||[]).forEach((item,i)=>add(section,entryText(section,item),(section==='experience'?'工作经历':SECTION_LABELS[section])+' '+(i+1)));
  (profile.skillGroups||[]).forEach((group,i)=>{if(group.items?.trim())add('skills',[
    [group.category,group.level].filter(Boolean).join(' · '),splitSkills(group.items).join('、'),group.evidence
  ].filter(Boolean).join('：'),'技能分类 '+(i+1));});
  const classified=new Set((profile.skillGroups||[]).flatMap(g=>splitSkills(g.items)).map(canon));
  add('skills',splitSkills(profile.skills).filter(skill=>!classified.has(canon(skill))).join(' · '),'技能清单');
  return facts;
}

export function normalizeDraft(payload, profile, materials=[]) {
  const rawFacts=profileFacts(profile), validSections=SECTION_IDS;
  const incoming=Array.isArray(payload?.facts)?payload.facts:[];
  if(!incoming.length)throw new Error('没有收到有效的简历内容，请重新生成');
  const facts=incoming.slice(0,100).filter(f=>typeof f.text==='string'&&f.text.trim()&&validSections.includes(f.section)).map(f=>{
    const original=rawFacts.find(raw=>raw.section===f.section&&raw.text===f.text.trim());
    const evidence=original||rawFacts.find(raw=>raw.section===f.section&&raw.sourceRef===f.sourceRef)||materials.find(m=>m.section===f.section&&(m.title===f.sourceRef||`素材夹 · ${m.title}`===f.sourceRef));
    return {id:uid(),section:f.section,text:f.text.trim().slice(0,6000),source:original?'USER':f.source==='AI-SUGGEST'?'AI-SUGGEST':'AI-INFER',sourceRef:evidence?.sourceRef||evidence?.title||'根据当前档案与目标岗位整理，请核对',originalText:evidence?.text||'',status:'pending'};
  });
  if(!facts.length)throw new Error('AI 返回的内容格式不完整，请重试');
  return facts;
}
export function demoDraft(profile, job) {
  const facts=profileFacts(profile).map(f=>{
    let text=f.text;
    if(f.section==='summary')text=polishDemoText(text);
    if(['experience','projects','competitions','research'].includes(f.section)){
      const index=Number(f.sourceRef.match(/\d+/)?.[0])-1,item=profile[f.section][index];
      text=entryText(f.section,item,polishDemoText);
    }
    return {...f,text,originalText:f.text,source:text===f.text?'USER':'AI-INFER',status:'pending'};
  });
  if(!facts.length)throw new Error('先填写一些个人经历，再开始定制简历');
  const match=job?matchJob(job,{},profile):null;
  if(job)facts.sort((a,b)=>{if(a.section!==b.section)return 0;const score=f=>(job.skills||[]).filter(s=>f.text.toLowerCase().includes(s.toLowerCase())).length;return score(b)-score(a);});
  if(match?.missing.length)facts.push({id:uid(),section:'projects',text:`如有 ${match.missing[0]} 的真实项目经验，请补充项目背景、个人职责和可核验成果。`,source:'AI-SUGGEST',sourceRef:'目标岗位要求（这是补充建议，不是个人经历）',status:'pending'});
  return facts;
}
export const confirmedFacts = facts => facts.filter(f=>f.status==='accepted' && f.source!=='AI-SUGGEST');
export function guessEmailStatus(text) {
  if(/未能|遗憾|不予|未通过|不合适|拒绝|reject|unfortunately/i.test(text))return 'rejected';
  if(/offer|录用|聘用|入职通知/i.test(text))return 'offer';
  if(/面试|interview/i.test(text))return 'interview';
  if(/笔试|测评|assessment|coding test/i.test(text))return 'test';
  if(/筛选|简历通过|screening/i.test(text))return 'screening';
  return null;
}
