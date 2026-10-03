import { $, $$, icon, escapeHTML as e, toast, modal } from './utils.js';
import { createStore } from './storage.js';
import { createRouter } from './router.js';
import { reminders, profileFacts } from './domain.js';
import { renderJobs } from './job-search.js';
import { renderStudio } from './resume-studio.js';
import { initializeLocalServices, aiEnabled } from './api.js';
import { renderTracker, openApplication } from './tracker.js';
import { renderInsights } from './insights.js';
import { renderSettings } from './settings.js';
import { startMailbox,mailPendingCount,showMailEvents } from './mail-ui.js';
import { recoverDeliveries } from './delivery.js';

const navigation=[{id:'jobs',name:'发现岗位',icon:'compass',en:'DISCOVER'},{id:'resume',name:'简历工作室',icon:'file',en:'RESUME'},{id:'tracker',name:'投递手账',icon:'board',en:'TRACKER'},{id:'insights',name:'求职洞察',icon:'chart',en:'INSIGHTS'}];
let ctx;
function updateShell(){
  const {state}=ctx.store;document.documentElement.dataset.theme=state.settings.theme;
  const name=state.profile.name||'新朋友';$('#profile-link').innerHTML=`<span class="avatar">${e(name[0])}</span><span><strong>${e(name)}</strong><small>${state.profile.isSample?'示例档案 · 点击编辑':'个人求职工作区'}</small></span>${icon('chevron',16)}`;$('#header-avatar').textContent=name[0];
  const active=aiEnabled(state.settings);
  $('#mode-label').innerHTML=`<i class="${active?'live':''}"></i>${active?'AI 已连接':'AI 未连接'}`;
  const count=reminders(state.applications).length+mailPendingCount(ctx);$('#notifications-button').innerHTML=icon('bell')+(count?`<span class="notification-dot">${count}</span>`:'');
  $('#notifications-button').setAttribute('aria-label',`查看提醒${count?`，${count} 条待办`:''}`);
  $$('.tracker-count').forEach(el=>el.textContent=state.applications.length);
}
function renderNavigation(){
  $('#desktop-nav').innerHTML=navigation.map(nav=>`<a href="#/${nav.id}" data-nav="${nav.id}" class="nav-link">${icon(nav.icon)}<span>${nav.name}</span>${nav.id==='tracker'?'<small class="tracker-count"></small>':''}</a>`).join('');
  $('#mobile-nav').innerHTML=[...navigation,{id:'settings',name:'设置',icon:'settings'}].map(nav=>`<a href="#/${nav.id}" data-nav="${nav.id}">${icon(nav.icon)}<span>${nav.name}</span></a>`).join('');
  $('#settings-link').innerHTML=icon('settings')+'<span>偏好设置</span>';$('#settings-link').dataset.nav='settings';
  $('#profile-link').onclick=$('#header-avatar').onclick=()=>{ctx.store.state.studio.view='editor';ctx.save();ctx.router.go('resume');};
  $('.skip-link').onclick=event=>{event.preventDefault();$('#main-content').focus();$('#main-content').scrollIntoView({block:'start'});};
  $('#notifications-button').onclick=()=>{
    const items=reminders(ctx.store.state.applications);
    const dialog=modal('你的求职提醒',`<p class="muted">页面内提醒会随记录更新；邮箱进展需核对后采用。</p>${mailPendingCount(ctx)?`<button class="notification-row" id="notification-mail">${icon('mail')}<span><strong>招聘邮件有回音</strong><small>${mailPendingCount(ctx)} 条进展待核实</small></span></button>`:''}${items.length?items.map(item=>`<button class="notification-row" data-application="${e(item.applicationId)}">${icon(item.kind==='interview'?'briefcase':'clock')}<span><strong>${e(item.title)}</strong><small>${e(item.text)}</small></span>${icon('chevron',16)}</button>`).join(''):'<div class="empty-state">今天没有待处理的提醒，按自己的节奏前进。</div>'}`);
    $('#notification-mail',dialog)?.addEventListener('click',()=>showMailEvents(ctx));
    $$('[data-application]',dialog).forEach(el=>el.onclick=()=>openApplication(ctx,el.dataset.application));
  };
}
async function init(){
  if(location.protocol==='file:')return;
  window.addEventListener('jp:storage-error',event=>{toast(event.detail,'error');$('#save-status').textContent='存储异常 · 请导出备份';});
  try{
    const [jobs,templates]=await Promise.all(['data/mock-jobs.json','data/templates.json'].map(async url=>{const result=await fetch(url);if(!result.ok)throw new Error('无法加载岗位数据');return result.json();}));
    const store=createStore(jobs),service=await initializeLocalServices();
    if(service?.configured&&store.state.settings.localSetupId!==service.setupId){Object.assign(store.state.settings,{mode:'live',provider:'qwen-local',model:service.model,consent:true,localSetupId:service.setupId});store.save();}
    ctx={store,templates,route:'jobs',get jobs(){return [...store.state.customJobs,...jobs];},jobById(id){return this.jobs.find(job=>job.id===id);},save(){const saved=store.save();updateShell();if(saved)$('#save-status').textContent='已保存在当前浏览器';},updateShell,openApplication(id){openApplication(ctx,id);},tailor(jobId){const r=store.state.resume;if(r.targetJobId!==jobId){r.facts=profileFacts(store.state.profile);r.generated=false;}r.targetJobId=jobId;store.state.studio.view='editor';this.save();this.router.go('resume');}};
    renderNavigation();updateShell();
    const pages={jobs:renderJobs,resume:renderStudio,tracker:renderTracker,insights:renderInsights,settings:renderSettings};
    ctx.router=createRouter(route=>{ctx.route=route;const title=navigation.find(n=>n.id===route)?.name||'偏好设置';document.title=`${title} · Jobseeker`;$('#page-label').textContent=title;$$('[data-nav]').forEach(el=>{const active=el.dataset.nav===route;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#main-content').classList.remove('page-enter');pages[route](ctx);requestAnimationFrame(()=>$('#main-content').classList.add('page-enter'));window.scrollTo({top:0,behavior:'instant'});});
    startMailbox(ctx);recoverDeliveries(ctx).catch(()=>{});
    setInterval(updateShell,60000);
  }catch(error){$('#main-content').innerHTML=`<div class="fatal-error"><h1>手账暂时没有打开</h1><p>${e(error.message)}</p><button class="button primary" onclick="location.reload()">重新加载</button></div>`;}
}
init();
