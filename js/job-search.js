import { $, $$, icon, escapeHTML as e, modal, toast, busy, emptyState, uid, splitSkills, safeURL, displayDate } from './utils.js';
import { filterJobs, matchJob, profileCompleteness, reminders } from './domain.js';
import { callAI, aiEnabled } from './api.js';
import { discoveryControls, runDiscovery, sourceSummary, useWebDiscovery } from './discovery-ui.js';

let visible=6,liveMatches=new Map(),searchStrategy='',matchGeneration=0,currentMatchController=null;
const AI_MATCH_LIMIT=12;
const matchingKey=ctx=>JSON.stringify({preferences:ctx.store.state.preferences,profile:ctx.store.state.profile,route:ctx.route});
function invalidateMatching(){matchGeneration++;currentMatchController?.abort();currentMatchController=null;}
export function normalizeJobMatches(jobs,result){
  if(!Array.isArray(result?.matches))throw new Error('AI 未返回有效岗位匹配结果');
  const allowed=new Set(jobs.map(job=>job.id)),seen=new Set(),matches=[];
  for(const item of result.matches){
    if(!allowed.has(item?.id)||seen.has(item.id)||!['number','string'].includes(typeof item.score)||String(item.score).trim()===''||!Number.isFinite(Number(item.score))||typeof item.analysis!=='string'||!item.analysis.trim())continue;
    seen.add(item.id);matches.push([item.id,{score:Math.max(0,Math.min(100,Math.round(Number(item.score)))),analysis:item.analysis,gaps:Array.isArray(item.gaps)?item.gaps.filter(x=>typeof x==='string').slice(0,8):[],source:'ai'}]);
  }
  if(!matches.length)throw new Error('AI 没有返回可用的岗位评分');
  return matches;
}
export async function matchJobBatch(settings,profile,preferences,jobs,{signal,request=callAI}={}){
  const candidates=jobs.slice(0,AI_MATCH_LIMIT);
  if(!candidates.length)return {matches:[],strategy:''};
  const result=await request(settings,'match',{profile,preferences:{query:preferences.query,skills:preferences.skills,city:preferences.city,employment:preferences.employment},jobs:candidates.map(({id,company,title,city,category,description,responsibilities,skills})=>({id,company,title,city,category,description:String(description||'').slice(0,3500),responsibilities:(responsibilities||[]).slice(0,5),skills:(skills||[]).slice(0,16)}))},{signal});
  return {matches:normalizeJobMatches(candidates,result),strategy:typeof result.strategy==='string'?result.strategy.trim():''};
}
async function rankJobs(ctx,button,jobs,generation){
  if(!jobs.length)return;
  const candidates=jobs.slice(0,AI_MATCH_LIMIT),key=matchingKey(ctx),controller=new AbortController();currentMatchController=controller;
  await busy(button,async()=>{
    const note=$('#strategy-note');if(note)note.innerHTML=`<p class="inline-note">${icon('sparkle',16)}正在用 AI 评估筛选结果中的前 ${candidates.length} 个岗位…</p>`;
    try{
      const result=await matchJobBatch(ctx.store.state.settings,ctx.store.state.profile,ctx.store.state.preferences,candidates,{signal:controller.signal});
      if(generation!==matchGeneration||ctx.route!=='jobs'||key!==matchingKey(ctx))return;
      const {matches,strategy:summary}=result;liveMatches=new Map([...liveMatches,...matches]);
      searchStrategy=`${summary?`${summary} · `:''}${matches.length} 个岗位为 AI 评分；其余为本地规则匹配`;
      drawResults(ctx);
    }catch(error){
      if(generation!==matchGeneration||controller.signal.aborted||ctx.route!=='jobs'||key!==matchingKey(ctx))return;
      searchStrategy=`AI 匹配失败：${error.message}。当前展示分数为本地规则匹配。`;
      drawResults(ctx);
      throw new Error(`AI 岗位匹配失败：${error.message}`);
    }finally{if(currentMatchController===controller)currentMatchController=null;}
  },'AI 匹配中…');
}
export const companyMark=job=>`<span class="company-mark ${['sage','peach','lilac','blue','rose','sand'].includes(job.tone)?job.tone:'sage'}">${e(job.logo||job.company.slice(0,1))}</span>`;
export const salaryLabel=job=>job.salaryMax?`${job.salaryMin}–${job.salaryMax}k`:'薪资面议';
export function toggleSaved(ctx,jobId){
  const state=ctx.store.state,existing=state.applications.find(app=>app.jobId===jobId);
  if(existing){ctx.openApplication(existing.id);return;}
  const job=ctx.jobById(jobId);if(!job)return;
  const at=new Date().toISOString();state.applications.unshift({id:uid(),jobId,company:job.company,title:job.title,city:job.city,category:job.category,status:'saved',channel:'待选择',createdAt:at,updatedAt:at,appliedAt:null,interviewAt:'',offerDeadline:'',notes:'',resumeVersion:'',history:[{status:'saved',at}],isSample:job.source==='demo'});ctx.save();toast('已收藏到投递手账，下一步可以定制简历');
}
export function renderJobs(ctx){
  invalidateMatching();liveMatches.clear();searchStrategy='';
  const {state}=ctx.store,p=state.preferences;visible=6;
  $('#main-content').innerHTML=`<div class="discovery-workspace">
  <section class="page-heading discovery-heading"><div><div class="eyebrow">YOUR NEXT CHAPTER</div><h1>发现下一份<span class="highlight-underline">热爱。</span></h1><p>找到合适的机会，再为它准备一份好简历。</p></div><button class="button secondary" id="import-jd">${icon('plus',17)}导入岗位 JD</button></section>
  <section class="search-panel" aria-label="寻找岗位"><div class="search-panel-top">${discoveryControls(ctx)}</div>
    <form id="search-form"><div class="search-fields">
      <label class="search-field position-field">${icon('search')}<span><small>理想职位 / 公司</small><input name="query" aria-label="理想职位或公司" placeholder="搜索职位、公司或你的下一个方向" value="${e(p.query)}"></span></label>
      <label class="search-field city-field">${icon('pin')}<span><small>工作地点</small><select name="city" aria-label="工作地点">${['','上海','北京','杭州','深圳','广州','成都','南京','武汉','苏州','西安','远程'].map(city=>`<option value="${city}" ${p.city===city?'selected':''}>${city||'全部城市'}</option>`).join('')}</select></span></label>
      <button class="button primary search-submit" type="submit">${icon('search',18)}${useWebDiscovery(ctx)?'联网寻找岗位':'发现好机会'}</button>
    </div>
    <div class="search-options-row"><div class="search-hints"><span>热门方向</span>${['前端工程师','产品经理','UI / UX 设计师','数据分析师'].map(word=>`<button type="button" class="text-chip" data-keyword="${word}">${word}</button>`).join('')}</div>
    <details class="search-refinements"><summary>${icon('filter',14)}更多意向<span>技能 / 公司 / 类型</span>${icon('down',13)}</summary><div class="discovery-extras">
      <label class="field">我的技能<input name="skills" aria-label="我的技能" placeholder="React、TypeScript…" value="${e(p.skills)}"></label>
      <label class="field">目标公司（可选）<input name="companies" maxlength="200" placeholder="例如：腾讯、字节跳动、华为" value="${e(p.companies||'')}"></label>
      <label class="field">求职类型<select name="employment">${['不限','实习','校招','社招'].map(t=>`<option ${p.employment===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <p class="caption">${useWebDiscovery(ctx)?'按你的求职意向检索公开招聘信息，联系方式不会用于搜索。':'示例岗位用于体验搜索、收藏和定制简历，不代表真实招聘。'}</p>
    </div></details></div></form>
  </section>
  <div id="discovery-progress" aria-live="polite"></div>
  <div class="discovery-layout"><section class="results-section" aria-label="岗位搜索结果"><div class="results-toolbar"><div class="tab-list" role="tablist" aria-label="岗位范围">${[{id:'all',label:'全部机会'},{id:'recommended',label:'为你推荐'},{id:'saved',label:'我的收藏'}].map(tab=>`<button role="tab" data-tab="${tab.id}" aria-selected="${(p.tab||'all')===tab.id}" class="tab ${(p.tab||'all')===tab.id?'active':''}">${tab.label}${tab.id==='all'?`<span id="all-jobs-count">${ctx.jobs.length}</span>`:''}</button>`).join('')}</div><label class="sort-label">${icon('filter',16)}<select id="sort-select" aria-label="岗位排序"><option value="match">匹配度优先</option><option value="salary">薪资优先</option><option value="newest">最新发布</option></select></label></div>
  <div class="filter-row"><label><select id="salary-filter" aria-label="最低薪资"><option value="">薪资范围</option><option value="15">15k 及以上</option><option value="25">25k 及以上</option><option value="35">35k 及以上</option></select></label><label><select id="size-filter" aria-label="公司规模"><option value="">公司规模</option>${['20–99 人','100–499 人','500–999 人','1000 人以上'].map(s=>`<option>${s}</option>`).join('')}</select></label><label><select id="category-filter" aria-label="岗位方向"><option value="">岗位方向</option>${[...new Set(ctx.jobs.map(j=>j.category))].map(c=>`<option>${e(c)}</option>`).join('')}</select></label><label class="checkbox-label"><input type="checkbox" id="remote-filter" ${p.remote?'checked':''}>支持远程</label><button class="text-button" id="clear-filters">重置</button></div>
  <div class="results-meta"><span id="result-count" aria-live="polite"></span><span class="demo-caption">${useWebDiscovery(ctx)?'招聘状态以官网为准':'示例岗位'}</span></div><div id="strategy-note"></div><div class="job-grid" id="job-grid"></div><div class="load-more" id="load-more"></div></section>
  <aside class="discovery-aside"><section class="notebook-card profile-card"><div class="card-eyebrow">让机会更懂你 ${icon('sparkle',16)}</div><div class="profile-completion"><div class="progress-ring" style="--progress:${profileCompleteness(state.profile)}"><span>${profileCompleteness(state.profile)}<small>%</small></span></div><div><h3>求职档案</h3><p>再完善一点，更近一步</p></div></div><div class="mini-tags">${splitSkills(state.profile.skills).slice(0,3).map(skill=>`<span>${e(skill)}</span>`).join('')||'<span>还没有添加技能</span>'}</div><a class="aside-link" href="#/resume">完善我的档案 ${icon('arrow',16)}</a></section>
  <section class="notebook-card journey-card"><div class="card-eyebrow">你的求职小进展 ${icon('leaf',17)}</div><div class="journey-stats"><div><strong>${state.applications.length.toString().padStart(2,'0')}</strong><span>记录的机会</span></div><div><strong>${state.applications.filter(a=>a.status==='interview').length.toString().padStart(2,'0')}</strong><span>进行中的面试</span></div></div><a class="aside-link" href="#/tracker">翻开投递手账 ${icon('arrow',16)}</a></section>
  <div class="discovery-note"><span class="discovery-note-mark">✳</span><p>不必等到万事俱备，<br>下一步就很好。</p><small>One step at a time.</small></div><p class="local-note">${icon('shield',14)}手账保存在你的浏览器</p></aside></div></div>`;
  const draw=()=>drawResults(ctx);
  $('#sort-select').value=p.sort||'match';$('#salary-filter').value=p.salary||'';$('#size-filter').value=p.size||'';$('#category-filter').value=p.category||'';
  $('#search-form').onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget);Object.assign(p,{query:String(data.get('query')).trim(),skills:String(data.get('skills')).trim(),city:String(data.get('city')),companies:String(data.get('companies')||''),employment:String(data.get('employment')||'')});visible=6;liveMatches.clear();searchStrategy='';invalidateMatching();const generation=matchGeneration;ctx.save();if(useWebDiscovery(ctx)){let discovered=false;await runDiscovery(ctx,$('.search-submit'),()=>{discovered=true;if(generation===matchGeneration&&ctx.route==='jobs')draw();});if(!discovered||generation!==matchGeneration||ctx.route!=='jobs')return;}const jobs=draw();await rankJobs(ctx,$('.search-submit'),jobs,generation);};
  $$('[data-discovery-mode]').forEach(button=>button.onclick=()=>{if(button.dataset.discoveryMode==='web'&&!aiEnabled(state.settings)){toast('请先配置 AI 服务','error');ctx.router.go('settings');return;}invalidateMatching();p.discoveryMode=button.dataset.discoveryMode;ctx.save();renderJobs(ctx);});
  $$('[data-keyword]').forEach(el=>el.onclick=()=>{$('[name="query"]').value=el.dataset.keyword;$('#search-form').requestSubmit();});
  $$('[data-tab]').forEach(el=>el.onclick=()=>{invalidateMatching();liveMatches.clear();searchStrategy='';p.tab=el.dataset.tab;ctx.save();$$('[data-tab]').forEach(t=>{t.classList.toggle('active',t===el);t.setAttribute('aria-selected',String(t===el));});visible=6;draw();});
  for(const [id,key] of [['sort-select','sort'],['salary-filter','salary'],['size-filter','size'],['category-filter','category'],['remote-filter','remote']])$('#'+id).onchange=event=>{invalidateMatching();liveMatches.clear();searchStrategy='';p[key]=event.target.type==='checkbox'?event.target.checked:event.target.value;ctx.save();visible=6;draw();};
  $('#clear-filters').onclick=()=>{invalidateMatching();Object.assign(p,{query:'',skills:'',city:'',salary:'',size:'',category:'',remote:false,tab:'all',sort:'match'});liveMatches.clear();searchStrategy='';ctx.save();renderJobs(ctx);};
  $('#import-jd').onclick=()=>openJDImport(ctx);draw();
}
function drawResults(ctx){
  const {state}=ctx.store,p=state.preferences;
  const web=useWebDiscovery(ctx),ids=state.agent.search.ids;const pool=web?ctx.jobs.filter(j=>j.source!=='demo'&&(p.tab==='saved'||j.source==='manual'||ids.includes(j.id))):ctx.jobs.filter(j=>j.source!=='web');
  $('#all-jobs-count').textContent=String(pool.length);
  let jobs=filterJobs(pool,web?{...p,query:'',city:''}:p,state.profile,state.applications.map(a=>a.jobId));
  if(web)jobs=jobs.map(j=>({...j,match:matchJob(j,p,state.profile)}));
  if(liveMatches.size&&p.sort==='match')jobs.sort((a,b)=>(liveMatches.get(b.id)?.score??b.match.score)-(liveMatches.get(a.id)?.score??a.match.score));
  $('#result-count').innerHTML=`找到 <strong>${jobs.length}</strong> 个值得了解的机会 <span class="muted">· ${web?'联网筛选 · 匹配分仅供参考':liveMatches.size?'AI + 本地规则':'基于技能的本地匹配'}</span>`;
  $('#strategy-note').innerHTML=[web?sourceSummary(state.agent.search):'',searchStrategy?`<p class="inline-note">${icon('sparkle',16)}${e(searchStrategy)}</p>`:''].join('');
  $('#job-grid').innerHTML=jobs.length?jobs.slice(0,visible).map(job=>{
    const saved=state.applications.some(app=>app.jobId===job.id),match=liveMatches.get(job.id)||job.match;
    return `<article class="job-card"><div class="job-card-top">${companyMark(job)}<div class="company-info"><strong>${e(job.company)}</strong><span>${e(job.industry)} · ${e(job.size)}</span></div><button class="bookmark-button ${saved?'saved':''}" data-save="${e(job.id)}" aria-label="${saved?'查看投递记录':'收藏'} ${e(job.company)} ${e(job.title)}" title="${saved?'查看投递记录':'收藏到投递手账'}">${icon('bookmark',19)}</button></div><button class="job-title" data-detail="${e(job.id)}"><h3>${e(job.title)}</h3></button><div class="job-pay"><strong>${salaryLabel(job)}</strong><span>${job.salaryMonths?`· ${job.salaryMonths} 薪`:''}</span></div><div class="job-metadata"><span>${icon('pin',14)}${e(job.city||'地点待补充')}</span><span>${e(job.experience||(job.source==='web'?'经验待核实':'经验不限'))}</span><span>${e(job.education||(job.source==='web'?'学历待核实':'学历不限'))}</span></div><div class="job-skill-tags">${job.skills.slice(0,3).map(s=>`<span class="${job.match.matched.includes(s)?'skill-match':''}">${e(s)}</span>`).join('')}${job.remote?'<span class="remote-tag">远程友好</span>':''}</div><div class="job-card-bottom"><span class="match-badge ${match.score>=80?'high':''}">${icon('sparkle',13)}${match.score}% ${match.source==='ai'?'AI 匹配':'规则匹配'}</span><span class="source-label">${job.source==='demo'?'演示岗位':job.source==='web'?'联网来源 · 待核实':'自行导入'}</span><button class="card-detail" data-detail="${e(job.id)}" aria-label="查看 ${e(job.company)} ${e(job.title)} 详情">${icon('arrow',18)}</button></div></article>`;
  }).join(''):web&&!state.agent.search.searchedAt?'':emptyState('这里还没有合适的机会','试试更宽泛的职位关键词，或调整城市和薪资筛选。','<button class="button secondary" id="empty-reset">清除筛选</button>');
  $('#load-more').innerHTML=jobs.length>visible?`<button class="button secondary" id="more-jobs">再看看更多机会 ${icon('down',16)}</button><small>已展示 ${Math.min(visible,jobs.length)} / ${jobs.length} 个机会</small>`:jobs.length?'<span class="end-note">— 好机会，也值得你慢慢挑选 —</span>':'';
  $('#more-jobs')?.addEventListener('click',()=>{visible+=6;drawResults(ctx);});$('#empty-reset')?.addEventListener('click',()=>$('#clear-filters').click());
  $$('[data-detail]').forEach(el=>el.onclick=()=>openJobDetail(ctx,el.dataset.detail));
  $$('[data-save]').forEach(el=>el.onclick=()=>{toggleSaved(ctx,el.dataset.save);drawResults(ctx);});
  return jobs;
}
export function openJobDetail(ctx,id){
  const job=ctx.jobById(id);if(!job)return;const localMatch=matchJob(job,ctx.store.state.preferences,ctx.store.state.profile),match={...localMatch,...liveMatches.get(id)};
  const dialog=modal('认识这个机会',`<div class="job-detail-heading">${companyMark(job)}<div><p class="eyebrow">${e(job.company)} · ${job.source==='demo'?'虚构演示岗位':job.source==='web'?'联网搜索来源':'用户自行导入'}</p><h2>${e(job.title)}</h2></div><strong class="detail-salary">${salaryLabel(job)}</strong></div><div class="detail-meta">${e(job.city||'地点待补充')} · ${e(job.experience||(job.source==='web'?'经验待核实':'经验不限'))} · ${e(job.education||(job.source==='web'?'学历待核实':'学历不限'))} · ${e(job.size||'规模待补充')}</div><div class="match-explanation" id="match-explanation"><div><strong>${icon('sparkle',17)}${match.score}% ${match.source==='ai'?'AI 匹配':'规则匹配'}</strong><p>${e(match.analysis)}</p></div><div class="mini-tags">${match.matched.map(s=>`<span>${e(s)} ✓</span>`).join('')}</div></div><h3 class="section-label">关于这个角色</h3><p class="pre-wrap">${e(job.description)}</p><h3 class="section-label">你将参与</h3><ul class="detail-list">${job.responsibilities.map(r=>`<li>${e(r)}</li>`).join('')||'<li>请查看原始 JD 描述。</li>'}</ul><h3 class="section-label">希望你具备</h3><div class="job-skill-tags">${job.skills.map(s=>`<span>${e(s)}</span>`).join('')}</div><p class="caption">${job.source==='demo'?'这是用于体验流程的虚构岗位，不代表真实招聘信息。':job.source==='web'?`读取日期：${displayDate(job.verifiedAt,true)} · 招聘状态以官网为准`:`导入日期：${displayDate(job.postedAt,true)}`}</p>${safeURL(job.url)?`<a class="text-button" href="${e(safeURL(job.url))}" target="_blank" rel="noopener noreferrer">查看招聘原文 ${icon('external',14)}</a>`:''}${job.evidence?`<div class="source-evidence"><strong>原文依据</strong><p>${e(job.evidence)}</p><small>${e(job.reason||'')}</small></div>`:''}<div class="dialog-actions"><button class="button secondary" id="detail-analyze">${icon('sparkle',16)}分析匹配</button><button class="button secondary" id="detail-save">${icon('bookmark',16)}${ctx.store.state.applications.some(a=>a.jobId===id)?'查看投递':'收藏岗位'}</button><button class="button primary" id="detail-tailor">为此定制简历 ${icon('arrow',16)}</button></div>`,true);
  $('#detail-save',dialog).onclick=()=>{toggleSaved(ctx,id);if(ctx.route==='jobs')drawResults(ctx);if($('#detail-save',dialog))$('#detail-save',dialog).innerHTML=icon('bookmark',16)+'查看投递';};
  $('#detail-tailor',dialog).onclick=()=>{dialog.close();ctx.tailor(id);};
  $('#detail-analyze',dialog).onclick=event=>busy(event.currentTarget,async()=>{if(!aiEnabled(ctx.store.state.settings)){toast('请先配置 AI 服务','error');return;}const key=matchingKey(ctx),generation=matchGeneration;const result=await matchJobBatch(ctx.store.state.settings,ctx.store.state.profile,ctx.store.state.preferences,[job]);if(!dialog.open||generation!==matchGeneration||key!==matchingKey(ctx))return;const data=result.matches.find(([jobId])=>jobId===id)?.[1];if(!data)throw new Error('未收到该岗位的匹配结果');liveMatches.set(id,data);if(ctx.route==='jobs')drawResults(ctx);$('#match-explanation',dialog).innerHTML=`<strong>${icon('sparkle',17)}AI 匹配建议 · ${Math.max(0,Math.min(100,Number(data.score)||0))}%</strong><p>${e(data.analysis)}</p><p class="caption">待补充：${e(Array.isArray(data.gaps)?data.gaps.join('、'):'请对照岗位要求核实')}</p>`;});
}
export function openJDImport(ctx){
  const dialog=modal('把感兴趣的机会，收进手账',`<p class="muted">粘贴岗位描述，整理成自己的机会卡片。信息不足的字段可以手动补充。</p><form id="jd-form"><label class="field">岗位描述<textarea name="jd" rows="7" required placeholder="在这里粘贴岗位职责、任职要求等原文…"></textarea></label><button type="button" class="button secondary" id="parse-jd">${icon('sparkle',16)}AI 解析岗位</button><div class="form-grid mt-20"><label class="field">公司名称<input name="company" required maxlength="100" placeholder="例如：你的目标公司"></label><label class="field">职位名称<input name="title" required maxlength="100" placeholder="例如：前端工程师"></label><label class="field">工作地点<input name="city" placeholder="上海 / 远程"></label><label class="field">技能要求<input name="skills" placeholder="用逗号分隔"></label><label class="field">月薪下限（k，可选）<input name="salaryMin" type="number" min="0" max="500" step="0.1"></label><label class="field">月薪上限（k，可选）<input name="salaryMax" type="number" min="0" max="500" step="0.1"></label></div><label class="field">招聘原文链接（可选）<input name="url" type="url" placeholder="https://…"></label><div class="dialog-actions"><button class="button primary" type="submit">保存岗位 ${icon('check',16)}</button></div></form>`,true);
  const form=$('#jd-form',dialog);
  $('#parse-jd',dialog).onclick=event=>busy(event.currentTarget,async()=>{const jd=form.elements.jd.value.trim();if(!jd)throw new Error('请先粘贴岗位描述');if(!aiEnabled(ctx.store.state.settings)){toast('请先配置 AI 服务','error');return;}const result=await callAI(ctx.store.state.settings,'parseJD',{jd});for(const field of ['title','company','city'])if(typeof result[field]==='string')form.elements[field].value=result[field];form.elements.skills.value=Array.isArray(result.skills)?result.skills.join(', '):'';toast('解析完成，请核对后保存');});
  form.onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));if(Number(values.salaryMax||0)<Number(values.salaryMin||0)){toast('薪资上限不能低于下限','error');return;}if(values.url&&!safeURL(values.url)){toast('招聘链接只支持 HTTP 或 HTTPS','error');return;}ctx.store.state.customJobs.unshift({id:uid(),company:values.company.trim(),title:values.title.trim(),city:values.city.trim(),skills:splitSkills(values.skills),salaryMin:Number(values.salaryMin)||0,salaryMax:Number(values.salaryMax)||0,remote:values.city.includes('远程'),size:'',category:'自定义',experience:'',education:'',industry:'自行导入',description:values.jd.trim(),responsibilities:values.jd.split('\n').filter(line=>line.trim()).slice(0,8),logo:values.company.trim()[0],tone:'sage',source:'manual',url:values.url,postedAt:new Date().toISOString()});ctx.save();dialog.close();toast('岗位已保存，可以开始定制简历');Object.assign(ctx.store.state.preferences,{query:'',tab:'all',city:'',salary:'',size:'',category:'',remote:false,sort:'newest'});ctx.save();ctx.router.go('jobs');};
}
