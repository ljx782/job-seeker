export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const uid = () => globalThis.crypto?.randomUUID?.() || `jp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const splitSkills = text => [...new Set(String(text || '').split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean))];
export const localDate = (value = new Date()) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const displayDate = (value, full = false) => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat('zh-CN', full ? {year:'numeric',month:'2-digit',day:'2-digit'} : {month:'long',day:'numeric'}).format(new Date(value)) : '未设置';
export const dateTime = value => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) : '未设置';
export const toLocalInput = value => { if (!value) return ''; const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return `${localDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export const safeURL = value => { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
export function download(name, content, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([content],{type})); const a = document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
export function csv(rows) { return '\uFEFF' + rows.map(row=>row.map(value=>{ let text=String(value??''); if (/^[\s]*[=+\-@]/.test(text)) text="'"+text; return '"'+text.replace(/"/g,'""')+'"'; }).join(',')).join('\r\n'); }
export function toast(message, type='success') { const node = document.createElement('div'); node.className=`toast ${type}`; node.textContent=message; $('#toast-stack').append(node); setTimeout(()=>node.remove(),5000); }
export function modal(title, body, wide = false) { const dialog=$('#app-dialog'); if (dialog.open) dialog.close(); dialog.className=wide?'wide-dialog':''; dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${escapeHTML(title)}</h2><button type="button" class="icon-button" data-close aria-label="关闭对话框">${icon('close')}</button></div><div class="dialog-body">${body}</div>`; $('[data-close]',dialog).onclick=()=>dialog.close(); dialog.onclick=event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}}; dialog.showModal(); return dialog; }
export async function busy(button, fn, label='正在整理…') { const old=button.innerHTML; button.disabled=true; button.setAttribute('aria-busy','true'); button.innerHTML=`<span class="loading-dot"></span>${label}`; try { return await fn(); } catch(error) { toast(error.message || '操作失败，请重试','error'); } finally { if(button.isConnected) {button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=old;} } }
export function emptyState(title, text, action='') { return `<div class="empty-state">${icon('search')}<h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>${action}</div>`; }
const paths = {
  search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
  board:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M6 8v4M12 8v7M18 8v3"/>',
  chart:'<path d="M4 3v17h17M8 15v-4M13 15V7M18 15V4"/>',
  settings:'<path d="m9 3-.7 2.3-2 .9L4 5.5 2 9l1.7 1.7v2.6L2 15l2 3.5 2.3-.7 2 .9L9 21h4l.7-2.3 2-.9 2.3.7 2-3.5-1.7-1.7v-2.6L20 9l-2-3.5-2.3.7-2-.9L13 3z"/><circle cx="11" cy="12" r="3"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0M10 13v3h4v-3"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15c2 1 3 2 3 5"/>',
  sparkle:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3zM20 2v4m-2-2h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  edit:'<path d="m15 4 5 5M4 20l5-1L21 7a3.5 3.5 0 0 0-5-5L4 14z"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  leaf:'<path d="M20 3C4 1 0 13 7 17c7 5 14-4 13-14ZM4 21l11-12"/>',
  external:'<path d="M14 3h7v7M21 3 10 14M10 3H4v17h17v-6"/>'
};
export function icon(name, size=20) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.file}</svg>`; }
