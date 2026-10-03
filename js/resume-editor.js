import {$,$$,escapeHTML as e,icon,toast,modal,busy} from './utils.js';
import {ENTRY_FIELDS,SKILL_CATEGORIES,SKILL_LEVELS,AUDIENCES,normalizeProfile,resumeChecklist,resumeFilename} from './resume-schema.js';
import {archiveDraft} from './studio-data.js';
import {profileFacts} from './domain.js';
import {technicalStudentProfile} from './demo-content.js';

export const EDITOR_STEPS=[['basic','基础信息'],['education','教育背景'],['skills','专业技能'],['projects','项目经验'],['experience','实习 / 工作'],['competitions','竞赛经历'],['credentials','证书荣誉'],['research','科研经历']];
const descriptions={basic:'留下联系、求职方向与作品入口。自我评价可省略，有内容时用三句话以内概括技术优势。',education:'学生简历的核心模块。课程选与岗位相关的 4–6 门；绩点、排名与荣誉按实际情况选填。',skills:'以真实实践支撑技能。熟练、掌握、了解分别填写，避免把未使用过的技术列进简历。',projects:'先写项目名称、时间与角色，再按背景、职责、行动、成果梳理。个人项目、竞赛作品与可复用 Skill 都可以写。',experience:'有实习或工作就展示，没有可以留空。写清时长、负责模块、工程交付与验证结果。',competitions:'写清赛事范围、名次、个人分工和技术产出。全国性赛事与本地活动分别标注，奖项必须有依据。',credentials:'只保留相关技术认证、语言能力和高价值荣誉。教育中已经出现的奖项无需重复填写。',research:'选填：实验室、大创、论文或数据集。说明研究方法、本人贡献及产出状态。'};
const field=(label,name,value,type='text',placeholder='')=>`<label class="field ${type==='textarea'?'full':''}">${e(label)}${type==='textarea'?`<textarea name="${e(name)}" rows="3" maxlength="8000" placeholder="${e(placeholder)}">${e(value||'')}</textarea>`:`<input name="${e(name)}" type="${type}" maxlength="500" value="${e(value||'')}" placeholder="${e(placeholder)}">`}</label>`;
const select=(label,name,value,options)=>`<label class="field">${e(label)}<select name="${e(name)}"><option value="">请选择（未填写则不展示）</option>${options.map(v=>`<option value="${e(v)}" ${v===value?'selected':''}>${e(v)}</option>`).join('')}</select></label>`;
export function drawChecklist(ctx){
 const node=$('#resume-checklist');if(!node)return;
 const checks=resumeChecklist(ctx.store.state.profile),done=checks.filter(c=>c.done).length;
 node.innerHTML=`<summary class="technical-readiness-heading">${icon('check',14)}<strong>档案准备度</strong><span aria-label="${done} 项完整，共 ${checks.length} 项">${done}/${checks.length}</span></summary><div class="technical-checks">${checks.map(c=>`<button type="button" data-check-step="${c.id}" class="${c.done?'complete':''}" title="${e(c.hint)}">${icon(c.done?'check':'edit',13)}${c.label}<small>${c.done?'已具备':'待完善'}</small></button>`).join('')}</div><p>竞赛、科研、证书按需填写，空白模块自动隐藏。准备度只检查资料完整性。</p>`;
 $$('[data-check-step]',node).forEach(b=>b.onclick=()=>$(`[data-step="${b.dataset.checkStep}"]`)?.click());
}
export function renderProfileEditor(ctx,activeStep,onChange,onNext){
 const profile=ctx.store.state.profile;for(const key of Object.keys(ENTRY_FIELDS))profile[key]??=[];
 const form=$('#profile-form');let html=`<div class="editor-section-title"><h3>${EDITOR_STEPS.find(s=>s[0]===activeStep)[1]}</h3><span>${['experience','competitions','credentials','research'].includes(activeStep)?'按需填写':'基础模块'}</span></div><p class="caption">${descriptions[activeStep]}</p>`;
 if(activeStep==='basic'){
  html+=`<div class="form-grid">${field('姓名','name',profile.name)}${field('意向岗位（必填）','role',profile.role,'text','AI 开发 / 后端 / 算法 / 前端 / 数据开发')}${field('电话','phone',profile.phone,'tel')}${field('电子邮箱','email',profile.email,'email','name@example.com')}${field('所在地 / 学校城市','city',profile.city)}${field('GitHub 地址','github',profile.github,'url','https://github.com/…')}${field('技术博客','blog',profile.blog,'url','https://…')}${field('个人网站 / 作品集','website',profile.website,'url','https://…')}${field('自我评价（选填，三句话以内）','summary',profile.summary,'textarea','技术栈 + 擅长方向 + 有真实经历支撑的优势。')}</div><label class="field">简历用途<select name="audience">${Object.entries(AUDIENCES).map(([id,label])=>`<option value="${id}" ${profile.audience===id?'selected':''}>${label}</option>`).join('')}</select><small>校招优先教育，技术求职优先实习工作，保研优先教育与科研。</small></label><div class="resume-filename-note">建议 PDF 文件名 <strong id="resume-filename">${e(resumeFilename(profile))}</strong></div><button type="button" class="button secondary small" id="technical-example">查看完整技术学生示例</button>`;
 }else if(activeStep==='skills'){
  html+=renderRows(profile,'skillGroups');
  html+=`<button type="button" class="button secondary small" id="add-entry">${icon('plus',14)}添加技能分类</button><details class="legacy-skill-input" ${profile.skills?'open':''}><summary>原有技能清单 / 自由补充</summary>${field('专业技能','skills',profile.skills,'textarea','已有内容会保留。分组填写后可删除这里的重复技能。')}</details>`;
 }else html+=renderRows(profile,activeStep)+`<button type="button" class="button secondary small" id="add-entry">${icon('plus',14)}添加一项${EDITOR_STEPS.find(s=>s[0]===activeStep)[1]}</button>`;
 const index=EDITOR_STEPS.findIndex(s=>s[0]===activeStep);
 html+=`<div class="editor-step-actions"><span class="caption">第 ${index+1} / ${EDITOR_STEPS.length} 步 · 输入即保存</span>${index<EDITOR_STEPS.length-1?'<button type="button" class="text-button" id="next-step">下一步 '+icon('arrow',15)+'</button>':'<span class="caption">核对后，点击上方优化并排版</span>'}</div>`;
 form.innerHTML=html;form.onsubmit=event=>event.preventDefault();
 form.oninput=event=>{const name=event.target.name;if(!name)return;const path=name.split('.');if(path.length===3)profile[path[0]][Number(path[1])][path[2]]=event.target.value;else profile[name]=event.target.value;onChange();drawChecklist(ctx);if($('#resume-filename'))$('#resume-filename').textContent=resumeFilename(profile);};
 const listKey=activeStep==='skills'?'skillGroups':activeStep;
 $('#add-entry')?.addEventListener('click',()=>{if(profile[listKey].length>=30){toast('每类最多添加 30 条','error');return;}profile[listKey].push({});onChange();renderProfileEditor(ctx,activeStep,onChange,onNext);});
 $$('[data-remove-entry]',form).forEach(el=>el.onclick=()=>{profile[listKey].splice(Number(el.dataset.removeEntry),1);onChange();renderProfileEditor(ctx,activeStep,onChange,onNext);});
 $('#next-step')?.addEventListener('click',()=>onNext(EDITOR_STEPS[index+1][0]));
 $('#technical-example')?.addEventListener('click',()=>{const dialog=modal('载入技术学生演示档案',`<p>包含分类技能、STAR 项目、AI 竞赛、科研与证书荣誉，所有人物与成果均为虚构示例。</p><p>当前档案和草稿会先保存到简历库，之后可以恢复。</p><button class="button primary" id="load-technical-example">保留当前草稿并载入示例</button>`);$('#load-technical-example',dialog).onclick=event=>busy(event.currentTarget,async()=>{await archiveDraft(ctx);const next=normalizeProfile(technicalStudentProfile());ctx.store.state.profile=next;ctx.store.state.resume={...ctx.store.state.resume,facts:profileFacts(next),generated:false,targetJobId:'',customJD:''};ctx.save();dialog.close();ctx.router.refresh();toast('技术学生示例已载入，原草稿已保留在简历库');});});
 drawChecklist(ctx);
}
function renderRows(profile,section){
 const entries=profile[section]||[],fields=ENTRY_FIELDS[section];
 if(!entries.length)return `<div class="editor-module-empty">${icon('plus',22)}<p>还没有填写${section==='skillGroups'?'技能分类':'这类经历'}</p><small>有内容再添加；留空不会出现在成品中。</small></div>`;
 return entries.map((item,i)=>`<section class="repeat-group"><div class="repeat-heading"><strong>${e(item.name||item.school||item.company||item.category||`条目 ${i+1}`)}</strong><button type="button" class="text-button" data-remove-entry="${i}">移除此项</button></div><div class="form-grid">${fields.map(([label,key,type='text',placeholder=''])=>{const name=`${section}.${i}.${key}`;return type==='select'?select(label,name,item[key],section==='competitions'?['全国性','省级 / 区域','校级','本地 / 社区','国际']:key==='category'?SKILL_CATEGORIES:SKILL_LEVELS):field(label,name,item[key],type,placeholder||(key==='period'?'例如：2025.09 — 2026.06':''));}).join('')}</div></section>`).join('');
}
