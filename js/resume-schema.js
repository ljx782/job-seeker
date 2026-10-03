import {splitSkills, safeURL} from './utils.js';

export const SECTION_LABELS={education:'教育背景',skills:'专业技能',projects:'项目经验',experience:'实习 / 工作经历',competitions:'竞赛经历',research:'科研经历',credentials:'证书与荣誉',summary:'自我评价'};
export const SECTION_IDS=Object.keys(SECTION_LABELS);
export const PROFILE_TEXT_FIELDS=['name','role','email','phone','city','website','github','blog','summary','skills'];
export const SKILL_CATEGORIES=['编程语言','框架与工具','数据库','云服务与运维','AI 模型与方法','协作与沟通'];
export const SKILL_LEVELS=['熟练','掌握','了解'];
export const AUDIENCES={student:'校招 / 实习',experienced:'技术求职',research:'保研 / 科研'};
const star=[['背景 / 要解决的问题','background','textarea','当时有什么需求、问题或限制？'],['你的职责','responsibility','textarea','你具体负责什么？区分个人工作与团队工作。'],['落地动作','actions','textarea','采用什么技术，完成哪些开发、训练或验证？'],['成果与验证条件','results','textarea','填真实数据和统计口径；没有数字也可写交付物、完成状态。']];
export const ENTRY_FIELDS={
 education:[['学校','school'],['专业','major'],['学历','degree'],['入学 — 毕业时间','period'],['核心课程（建议 4–6 门）','courses','textarea','选择与目标方向相关的课程，用逗号分隔。'],['绩点 / 满分（选填）','gpa','text','例如 3.5 / 4.0'],['专业排名（选填）','ranking','text','例如 前 10%（按实际情况填写）'],['在校荣誉（选填）','honors','text','一行概括相关奖学金或荣誉']],
 experience:[['公司 / 机构','company'],['岗位','position'],['任职时间','period'],...star,['原有描述 / 补充素材','description','textarea','也可以先用自己的话说明经历，再让 AI 整理。']],
 projects:[['项目名称','name'],['开发时间','period'],['个人角色','role'],['技术栈 / 工具','stack'],['项目 / 仓库链接（选填）','url','url','https://…'],...star,['原有描述 / 补充素材','description','textarea','支持竞赛项目、个人开发、预测模型、可复用 Skill 等真实实践。']],
 competitions:[['赛事名称','name'],['名次 / 奖项','award'],['参赛时间','period'],['赛事范围','level','select'],['赛道方向','track'],['团队分工 / 个人角色','role'],['核心技术','stack'],['开发过程与个人贡献','description','textarea'],['沉淀产出 / 验证结果','results','textarea','可复用分析框架、数据集模板、模型评测等；只填已完成的产出。'],['官方证明 / 作品链接','url','url','https://…']],
 research:[['课题 / 项目名称','name'],['实验室 / 机构','organization'],['研究时间','period'],['个人角色','role'],['研究方法 / 技术','stack'],...star,['论文 / 数据集 / 代码链接','url','url','https://…'],['补充说明','description','textarea','论文请区分已发表、录用、在投；明确作者贡献。']],
 credentials:[['证书 / 荣誉名称','name'],['颁发机构','issuer'],['获得时间','period'],['等级 / 成绩 / 说明','detail','text','仅保留技术认证、语言能力或高价值荣誉。'],['验证链接（选填）','url','url','https://…']],
 skillGroups:[['技能分类','category','select'],['掌握程度','level','select'],['具体技能','items','textarea','例如 Python, Pandas, scikit-learn'],['实践依据（选填）','evidence','text','例如：用于清洗数据、训练和评估分类模型']]
};
export const PROFILE_LIST_FIELDS=Object.fromEntries(Object.entries(ENTRY_FIELDS).map(([section,fields])=>[section,fields.map(f=>f[1])]));
export function normalizeProfile(input={}){
 const text=v=>typeof v==='string'?v.slice(0,10000):'';
 const profile=Object.fromEntries(PROFILE_TEXT_FIELDS.map(key=>[key,text(input[key])]));
 for(const [section,keys] of Object.entries(PROFILE_LIST_FIELDS)){
  const list=input[section]??[];if(!Array.isArray(list)||list.length>30)throw new Error('档案条目格式不正确');
  profile[section]=list.map(item=>Object.fromEntries(keys.map(key=>[key,text(item?.[key])])));
 }
 for(const group of profile.skillGroups){if(!SKILL_CATEGORIES.includes(group.category))group.category='';if(!SKILL_LEVELS.includes(group.level))group.level='';}
 profile.audience=Object.hasOwn(AUDIENCES,input.audience)?input.audience:'student';profile.isSample=Boolean(input.isSample);return profile;
}
export function sectionOrder(profile={},resume={}){
 if(profile.audience==='research')return ['education','research','projects','skills','experience','competitions','credentials','summary'];
 if(profile.audience!=='experienced')return ['education','skills','projects','experience','competitions','research','credentials','summary'];
 return resume.template==='design'?['skills','projects','experience','education','competitions','research','credentials','summary']:['skills','experience','projects','education','competitions','research','credentials','summary'];
}
export function profileSkillText(profile={}){return [profile.skills,...(profile.skillGroups||[]).map(g=>g.items)].filter(Boolean).join(',');}
export function contactValues(profile={}){return [profile.phone,profile.email,profile.city,...[profile.github,profile.blog,profile.website].filter(v=>safeURL(v))].filter(Boolean);}
export function resumeFilename(profile={},extension='pdf'){
 const part=v=>String(v||'').trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,60);
 return [part(profile.name)||'姓名',part(profile.role)||'意向岗位',part(profile.education?.find(e=>e.school?.trim())?.school)||'学校'].join('-')+'.'+extension;
}
const line=(label,value)=>String(value||'').trim()?`${label}：${String(value).trim()}`:'';
export function entryText(section,item,polish=value=>String(value||'').trim()){
 const header=section==='education'?[item.school,item.major,item.degree,item.period]:section==='experience'?[item.company,item.position,item.period]:section==='projects'?[item.name,item.period,item.role]:section==='competitions'?[item.name,item.award,item.period]:section==='research'?[item.name,item.organization,item.period,item.role]:[item.name,item.issuer,item.period];
 const lines=[header.filter(v=>v?.trim()).join(' | ')];
 if(section==='education')lines.push(line('核心课程',splitSkills(item.courses).join('、')),line('绩点',item.gpa),line('排名',item.ranking),line('荣誉',item.honors));
 else{
  lines.push(line('技术',item.stack));
  if(section==='competitions')lines.push(line('赛事范围',item.level),line('赛道',item.track),line('分工',item.role));
  for(const [key,label] of [['background','背景'],['responsibility','职责'],['actions','行动'],['results','成果']])if(item[key]?.trim())lines.push(`• ${label}：${polish(item[key])}`);
  if(item.description?.trim())lines.push(polish(item.description));
  if(item.detail?.trim())lines.push(item.detail.trim());
  if(safeURL(item.url))lines.push(`链接：${safeURL(item.url)}`);
 }
 return lines.filter(Boolean).join('\n');
}
export function resumeChecklist(profile){
 const checks=[['basic','联系方式与意向',Boolean(profile.name?.trim()&&profile.role?.trim()&&profile.email?.trim()&&profile.phone?.trim()),'填写姓名、意向岗位、电话和邮箱'],['education','教育信息',profile.education?.some(e=>e.school&&e.major&&e.degree&&e.period),'补齐学校、专业、学历和起止时间'],['skills','技能分类与程度',profile.skillGroups?.some(g=>g.items&&g.category&&g.level),'按类别填写真实技能，标明熟练 / 掌握 / 了解'],['projects','项目与成果',profile.projects?.some(p=>p.name&&p.period&&p.role&&(p.results||p.description)),'补齐项目时间、职责与可验证成果']];
 return checks.map(([id,label,done,hint])=>({id,label,done:Boolean(done),hint}));
}
