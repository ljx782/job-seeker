import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {load} from 'cheerio';
import {ServiceError} from './ai.mjs';
export function publicIPv4(ip){if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===198&&[18,19].includes(b)));}
export function publicURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.includes(':')||u.hostname.endsWith('.local')||isIP(u.hostname)&&!publicIPv4(u.hostname))return '';u.hash='';return u.href;}catch{return '';}}
async function fetchPublicBody(value,{signal,redirects=0,kind='html'}={}){
  const url=publicURL(value);if(!url)throw new ServiceError('招聘来源必须是公开 HTTPS 页面');
  const host=new URL(url).hostname,addresses=await lookup(host,{family:4,all:true});if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw new ServiceError('来源地址不可访问');
  const response=await new Promise((resolve,reject)=>{
    const req=https.get(url,{signal,lookup:(_host,options,cb)=>options.all?cb(null,[addresses[0]]):cb(null,addresses[0].address,4),headers:{'User-Agent':'Jobseeker/1.0 (public recruitment page reader)','Accept':'text/html,application/xhtml+xml'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400){res.resume();resolve({redirect:res.headers.location});return;}
      if(res.statusCode!==200||!(kind==='json'?String(res.headers['content-type']).includes('application/json'):/text\/html|application\/xhtml/.test(String(res.headers['content-type'])))){res.resume();reject(new ServiceError('招聘页暂不可读取'));return;}
      const chunks=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){req.destroy(new Error('Page too large'));return;}chunks.push(chunk);});res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
    });req.setTimeout(12000,()=>req.destroy(new Error('Page timeout')));req.on('error',reject);
  });
  if(response.redirect){if(redirects>=3)throw new ServiceError('招聘页跳转过多');return fetchPublicBody(new URL(response.redirect,url).href,{signal,redirects:redirects+1,kind});}
  return {url,body:response.body};
}
export async function fetchJSON(value,options={}){const {body}=await fetchPublicBody(value,{...options,kind:'json'});try{return JSON.parse(body);}catch{throw new ServiceError('官网接口没有返回有效数据');}}
export async function fetchPage(value,options={}){
  const {url,body}=await fetchPublicBody(value,options);
  const $=load(body),title=$('title').text().trim();const structured=[];$('script[type="application/ld+json"]').each((_i,el)=>{try{const data=JSON.parse($(el).text());const collect=x=>{if(!x||typeof x!=='object')return;if(x['@type']==='JobPosting')structured.push(x);else if(Array.isArray(x))x.forEach(collect);else if(x['@graph'])collect(x['@graph']);};collect(data);}catch{}});
  $('script,style,nav,footer,header,noscript,svg').remove();const text=$('body').text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,18000);
  return {url,title,text:structured.length?JSON.stringify(structured).slice(0,18000)+'\n'+text.slice(0,2000):text};
}
