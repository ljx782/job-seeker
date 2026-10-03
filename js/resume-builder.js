import { SECTION_LABELS, sectionOrder, contactValues, resumeFilename } from './resume-schema.js';
import { EDITOR_STEPS, renderProfileEditor } from './resume-editor.js';
import { $, $$, icon, escapeHTML as e, toast, modal, busy, download, uid, dateTime, safeURL } from './utils.js';
import { profileFacts, normalizeDraft, confirmedFacts } from './domain.js';
import { allVersions, versionAction, initialState } from './storage.js';
import { callAI, localRequest } from './api.js';
import { archiveDraft } from './studio-data.js';
import { openDelivery } from './delivery.js';

const steps=EDITOR_STEPS;
const sections=SECTION_LABELS;
let activeStep='basic',previewMode='review';
function factBody(f){
 const lines=String(f.text).split(/\r?\n/).filter(Boolean),structured=['education','experience','projects','competitions','research','credentials'].includes(f.section);
 return lines.map((line,i)=>structured&&i===0?`<strong class="resume-entry-title">${e(line)}</strong>`:`<div class="resume-entry-line ${line.startsWith('• ')?'bullet':''}">${e(line)}</div>`).join('');
}
export function resumeHTML(profile,resume,{exporting=false}={}){
  const facts=exporting?confirmedFacts(resume.facts):resume.facts.filter(f=>f.status!=='rejected');
  const order=sectionOrder(profile,resume);
  const contact=contactValues(profile);
  return `<article class="resume-paper template-${e(resume.template)}"><header class="resume-person"><h2>${e(profile.name||'你的名字')}</h2><p class="resume-role">${e(profile.role||'理想的职业方向')}</p><div class="resume-contact">${contact.map(v=>`${safeURL(v)?`<a href="${e(safeURL(v))}" target="_blank" rel="noopener noreferrer">${e(v)}</a>`:`<span>${e(v)}</span>`}`).join('')}</div></header>${facts.length?order.map(section=>{const items=facts.filter(f=>f.section===section);return items.length?`<section class="resume-section"><h3>${sections[section]}</h3>${items.map(f=>`<div class="resume-fact ${!exporting&&f.status==='pending'?'pending':''} ${f.source==='AI-SUGGEST'?'suggestion':''}" data-fact="${e(f.id)}">${!exporting?`<div class="source-row"><span class="source-chip ${f.source==='USER'?'user':''}">${f.source==='USER'?'原始信息':f.source==='AI-INFER'?'推断 / 改写':'建议补充'}</span><span>${f.status==='accepted'?'已确认':f.source==='AI-SUGGEST'?'仅为建议，不会导出':'待核对'}</span><span title="${e(f.sourceRef)}">· ${e(f.sourceRef)}</span></div>`:''}${!exporting&&f.originalText&&f.originalText!==f.text?`<details class="rewrite-original"><summary>查看原始输入</summary><p>${e(f.originalText)}</p></details><small class="rewrite-label">优化后的表达</small>`:''}<div class="fact-text">${factBody(f)}</div>${!exporting?`<div class="fact-actions">${f.status==='pending'&&f.source!=='AI-SUGGEST'?`<button data-accept="${e(f.id)}">✓ 核实并确认</button>`:''}<button data-edit="${e(f.id)}">${f.source==='AI-SUGGEST'?'补充真实经历':'编辑'}</button><button data-reject="${e(f.id)}">${f.status==='pending'?'不采用':'移除'}</button></div>`:''}</div>`).join('')}</section>`:'';}).join(''):`<div class="empty-state"><h3>你的故事，从这里展开</h3><p>${exporting?'暂时没有已确认的简历内容。':'在左侧填写信息，简历会同步呈现。'}</p></div>`}</article>`;
}
export function resumeMarkdown(profile,resume){
  const facts=confirmedFacts(resume.facts);const contact=contactValues(profile).join(' · ');
  const lines=[`# ${profile.name||'简历'}`,'',profile.role||'',contact,''];
  for(const section of sectionOrder(profile,resume)){const label=sections[section];const items=facts.filter(f=>f.section===section);if(items.length)lines.push(`## ${label}`,'',...items.flatMap(f=>[f.text,'']));}
  return lines.join('\n');
}
export function renderResume(ctx){
  const {state}=ctx.store,r=state.resume;
  $('#main-content').innerHTML=`<div class="resume-workspace">
    <section class="page-heading resume-heading">
      <div><h1>把经历，<span class="highlight-underline">写成机会。</span></h1><ol class="resume-workflow" aria-label="简历制作流程"><li><b>01</b>填写经历</li><li><b>02</b>AI 优化</li><li><b>03</b>核对导出</li></ol></div>
      <button class="button secondary" id="resume-versions">${icon('clock',16)}简历版本</button>
    </section>
    ${state.profile.isSample?'<div class="sample-notice"><span><strong>示例档案</strong> · 导出前，请替换为自己的真实经历。</span><button class="text-button" id="blank-profile">从空白开始</button></div>':''}
    <div class="resume-toolbar">
      <label class="field">目标机会<select id="resume-target"><option value="">通用简历 · 暂不指定岗位</option>${ctx.jobs.map(job=>`<option value="${e(job.id)}" ${r.targetJobId===job.id?'selected':''}>${e(job.company)} · ${e(job.title)}</option>`).join('')}<option value="custom" ${r.targetJobId==='custom'?'selected':''}>粘贴自己的岗位 JD</option></select></label>
      <label class="field">简历模板<select id="resume-template">${ctx.templates.map(t=>`<option value="${t.id}" ${r.template===t.id?'selected':''}>${e(t.name)}</option>`).join('')}</select></label>
      <button class="button primary" id="generate-resume">${icon('sparkle',17)}AI 优化并排版</button>
    </div>
    <div id="custom-jd-area" ${r.targetJobId==='custom'?'':'hidden'}><label class="field">目标岗位 JD<textarea id="custom-jd" rows="4" placeholder="粘贴目标岗位的职责与要求，用于内容定制">${e(r.customJD)}</textarea></label></div>
    <div class="resume-options">
      <details id="resume-checklist" class="technical-readiness" aria-label="技术简历准备度"></details>
      <details class="generation-note"><summary>${icon('edit',14)}定制要求<span>表达重点与语气</span></summary><label class="field">补充要求<textarea id="resume-instruction" rows="2" maxlength="2000" placeholder="例如：强调项目中的独立贡献，保持简洁，不补造数据">${e(r.instruction||'')}</textarea></label><p class="caption">AI 会保留真实成绩、技能程度与成果依据。生成后，请逐条核实。</p></details>
    </div>
    <nav class="resume-pane-links" aria-label="跳转到编辑或预览"><a href="#resume-editor-panel" id="jump-to-editor">${icon('edit',15)}编辑经历</a><a href="#resume-preview-panel" id="jump-to-preview">${icon('file',15)}核对与导出 ${icon('arrow',14)}</a></nav>
    <div class="resume-layout">
      <section class="panel editor-panel" id="resume-editor-panel" aria-label="个人档案编辑">
        <div class="workspace-panel-heading"><h2>经历档案</h2><span>${icon('check',13)}输入即保存</span></div>
        <div class="editor-tabs" role="tablist" aria-label="个人档案编辑步骤">${steps.map(([id,label])=>`<button role="tab" data-step="${id}" aria-selected="${activeStep===id}" class="${activeStep===id?'active':''}">${label}</button>`).join('')}</div>
        <form id="profile-form" class="editor-form"></form>
      </section>
      <section class="preview-panel" id="resume-preview-panel" aria-label="简历预览与导出">
        <div class="preview-heading"><h2>核对与预览</h2><button class="button secondary small" id="save-version">${icon('clock',14)}保存版本</button></div>
        <div class="preview-controls"><div class="preview-switch" aria-label="预览模式"><button id="preview-review" class="text-button">原文与改写对照</button><button id="preview-finished" class="text-button">成品预览</button></div><div class="button-group export-actions" aria-label="导出简历"><button class="button secondary small" id="export-md">Markdown</button><button class="button secondary small" id="export-docx">Word</button><button class="button secondary small" id="export-pdf">${icon('download',13)}PDF</button></div></div>
        <div id="review-summary"></div><div id="resume-preview"></div>
        <p class="caption resume-export-note">${icon('shield',13)}仅导出已确认内容，补充建议不会进入简历。PDF 请在打印窗口选择「另存为 PDF」。</p>
        <div class="resume-delivery-bar"><div><strong>准备好出发了？</strong><small>带上这份简历，走向下一次机会。</small></div><button class="button primary small" id="resume-deliver">投递这份简历 ${icon('arrow',14)}</button></div>
      </section>
    </div>
  </div>`;
  drawProfileForm(ctx);drawPreview(ctx);
  for(const [id,target] of [['jump-to-editor','resume-editor-panel'],['jump-to-preview','resume-preview-panel']])$('#'+id).onclick=event=>{event.preventDefault();$('#'+target).scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});};
  $('#preview-review').onclick=()=>{previewMode='review';drawPreview(ctx);};
  $('#preview-finished').onclick=()=>{previewMode='finished';drawPreview(ctx);};
  $('#resume-deliver').onclick=()=>openDelivery(ctx);
  $('#resume-instruction').oninput=event=>{r.instruction=event.target.value;ctx.save();};
  $('#export-docx').onclick=event=>busy(event.currentTarget,async()=>{if(!canExport(ctx))return;const blob=await localRequest('/api/resume/docx',{profile:state.profile,resume:r},{blob:true});download(resumeFilename(state.profile,'docx'),blob,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');toast('Word 简历已导出，仅包含已确认内容');},'导出中…');
  $$('[data-step]').forEach(el=>el.onclick=()=>{activeStep=el.dataset.step;drawProfileForm(ctx);$$('[data-step]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-selected',String(b===el));});});
  $('#resume-template').onchange=event=>{r.template=event.target.value;ctx.save();drawPreview(ctx);};
  $('#resume-target').onchange=event=>{r.targetJobId=event.target.value;$('#custom-jd-area').hidden=r.targetJobId!=='custom';invalidateDraft(ctx);};
  $('#custom-jd').oninput=event=>{r.customJD=event.target.value;if(r.generated)invalidateDraft(ctx);else ctx.save();};
  $('#generate-resume').onclick=event=>busy(event.currentTarget,async()=>{
    if(!profileFacts(state.profile).length)throw new Error('先填写一些经历或技能，再开始整理');
    const job=r.targetJobId==='custom'?{id:'custom',title:state.profile.role||'目标职位',description:r.customJD,skills:[],city:'',company:'自定义岗位'}:ctx.jobById(r.targetJobId);
    if(r.targetJobId==='custom'&&!r.customJD.trim())throw new Error('请先粘贴目标岗位 JD');
    const snapshot=JSON.stringify({profile:state.profile,target:r.targetJobId,jd:r.customJD,instruction:r.instruction});
    const facts=normalizeDraft(await callAI(state.settings,'resume',{profile:state.profile,sourceFacts:profileFacts(state.profile).map(({text,sourceRef,section})=>({text,sourceRef,section})),job:job||{description:'通用简历'},materials:state.studio?.materials||[],instruction:r.instruction||''}),state.profile,state.studio?.materials||[]);
    if(state.resume!==r||snapshot!==JSON.stringify({profile:state.profile,target:r.targetJobId,jd:r.customJD,instruction:r.instruction}))throw new Error('生成期间档案或目标已改变，请按最新内容重新生成');
    previewMode='review';r.facts=facts;r.generated=true;ctx.save();if(ctx.route==='resume')drawPreview(ctx);toast('AI 内容已生成，请逐条核实再确认');
  },'正在整理经历…');
  $('#export-md').onclick=()=>{if(!canExport(ctx))return;download(resumeFilename(state.profile,'md'),resumeMarkdown(state.profile,r),'text/markdown;charset=utf-8');toast('已导出已确认的简历内容');};
  $('#export-pdf').onclick=()=>{if(!canExport(ctx))return;$('#print-root').innerHTML=resumeHTML(state.profile,r,{exporting:true});const previousTitle=document.title;document.title=resumeFilename(state.profile).replace(/\.pdf$/,'');const restore=()=>{document.title=previousTitle;};window.addEventListener('afterprint',restore,{once:true});try{window.print();}catch(error){restore();throw error;}};
  $('#save-version').onclick=event=>busy(event.currentTarget,async()=>{if(!canExport(ctx))return;const job=ctx.jobById(r.targetJobId);const versions=await allVersions();const version={id:uid(),name:`${state.profile.name||'我的简历'} · ${job?.company||'通用'} · V${versions.length+1}`,savedAt:new Date().toISOString(),kind:r.generated?'ai':'manual',customJD:r.customJD,instruction:r.instruction||'',profile:structuredClone(state.profile),facts:structuredClone(confirmedFacts(r.facts)),template:r.template,targetJobId:r.targetJobId};await versionAction('put',version);toast('简历版本已保存在本机，可在投递记录中关联');},'保存中…');
  $('#resume-versions').onclick=()=>showVersions(ctx);
  $('#blank-profile')?.addEventListener('click',()=>{const dialog=modal('从你的真实经历开始',`<p>这会清空当前示例档案与简历草稿，已保存的简历版本不受影响。</p><div class="dialog-actions"><button class="button primary" id="confirm-blank">创建空白档案</button></div>`);$('#confirm-blank',dialog).onclick=()=>{const blank=initialState([],false);state.profile=blank.profile;state.resume=blank.resume;ctx.save();dialog.close();ctx.router.refresh();toast('空白档案已准备好，从基本信息开始吧');};});
}
function drawProfileForm(ctx){renderProfileEditor(ctx,activeStep,()=>invalidateDraft(ctx),step=>$(`[data-step="${step}"]`).click());}
function invalidateDraft(ctx){const r=ctx.store.state.resume;if(r.generated)toast('档案已更新，预览恢复为原始信息；可重新生成定制草稿');r.facts=profileFacts(ctx.store.state.profile);r.generated=false;ctx.save();drawPreview(ctx);}
function drawPreview(ctx){
  const {profile,resume:r}=ctx.store.state;if(!$('#resume-preview'))return;
  $('#resume-preview').innerHTML=resumeHTML(profile,r,{exporting:previewMode==='finished'});
  $('#preview-review')?.setAttribute('aria-pressed',String(previewMode==='review'));$('#preview-finished')?.setAttribute('aria-pressed',String(previewMode==='finished'));
  if(previewMode==='finished')$('#resume-preview').insertAdjacentHTML('afterbegin','<p class="caption">成品仅展示已确认内容，与实际导出一致。待核实内容请返回对照视图确认。</p>');
  const pending=r.facts.filter(f=>f.status==='pending'),originals=pending.filter(f=>f.source==='USER');
  $('#review-summary').innerHTML=pending.length?`<div class="review-summary"><span>${icon('shield',13)}${pending.length} 项待核实 · 已确认 ${confirmedFacts(r.facts).length} 项</span>${originals.length?`<button class="text-button" id="accept-originals">确认 ${originals.length} 项原始信息</button>`:''}</div>`:'';
  $('#accept-originals')?.addEventListener('click',()=>{originals.forEach(f=>f.status='accepted');ctx.save();drawPreview(ctx);toast('原始信息已确认，推断内容仍需逐条核实');});
  $$('[data-accept]').forEach(el=>el.onclick=()=>{const f=r.facts.find(x=>x.id===el.dataset.accept);if(f.source==='AI-SUGGEST')return;f.status='accepted';ctx.save();drawPreview(ctx);});
  $$('[data-reject]').forEach(el=>el.onclick=()=>{r.facts.find(x=>x.id===el.dataset.reject).status='rejected';ctx.save();drawPreview(ctx);});
  $$('[data-edit]').forEach(el=>el.onclick=()=>{const f=r.facts.find(x=>x.id===el.dataset.edit);const dialog=modal(f.source==='AI-SUGGEST'?'补充你的真实经历':'核对这段经历',`<p class="caption">来源：${e(f.sourceRef)}。请只保留可以核实的事实。</p><form id="fact-edit-form"><label class="field">简历内容<textarea name="text" rows="7" required>${f.source==='AI-SUGGEST'?'':e(f.text)}</textarea></label><div class="dialog-actions"><button class="button primary">已核实，保存到简历</button></div></form>`);$('#fact-edit-form').onsubmit=event=>{event.preventDefault();const text=event.currentTarget.elements.text.value.trim();if(!text)return;Object.assign(f,{text,status:'accepted',source:'USER',sourceRef:'用户手动编辑并确认'});ctx.save();dialog.close();drawPreview(ctx);};});
}
function canExport(ctx){const {profile,resume}=ctx.store.state;if(!profile.name.trim()||!profile.role.trim()){toast('先填写姓名和意向岗位，再导出你的简历','error');return false;}if(!confirmedFacts(resume.facts).length){toast('还没有已确认内容，请先核实并确认草稿','error');return false;}if(resume.facts.some(f=>f.status==='pending'))toast('本次仅导出已确认内容，待核实内容和建议已排除');return true;}
async function showVersions(ctx){
  try{const versions=await allVersions();const dialog=modal('每一版，都是更好的表达',`<p class="muted">版本保存于当前浏览器的 IndexedDB。可以在设置中随工作区一并备份。</p>${versions.length?versions.filter(v=>!v.sourceText).map(v=>`<div class="version-item"><h3>${e(v.name)}</h3><p class="caption">${dateTime(v.savedAt)} · ${v.facts.length} 项已确认内容</p><div class="button-group"><button class="button secondary small" data-restore="${e(v.id)}">恢复到编辑器</button><button class="button secondary small" data-version-md="${e(v.id)}">导出 Markdown</button></div></div>`).join(''):'<div class="empty-state"><h3>还没有保存的版本</h3><p>确认简历后，点击预览上方的「保存版本」。</p></div>'}`);
    $$('[data-restore]',dialog).forEach(el=>el.onclick=()=>busy(el,async()=>{const v=versions.find(x=>x.id===el.dataset.restore);await archiveDraft(ctx);ctx.store.state.profile=structuredClone(v.profile);ctx.store.state.resume={...ctx.store.state.resume,facts:structuredClone(v.facts),template:v.template,targetJobId:v.targetJobId,generated:true};ctx.save();dialog.close();ctx.router.refresh();toast('已恢复所选版本，之前的草稿已保留');}));
    $$('[data-version-md]',dialog).forEach(el=>el.onclick=()=>{const v=versions.find(x=>x.id===el.dataset.versionMd);download(resumeFilename(v.profile,'md'),resumeMarkdown(v.profile,v),'text/markdown;charset=utf-8');});
  }catch(error){toast(error.message,'error');}
}
