import {fetchJSON,publicURL} from './web.mjs';
// Public Tencent careers query/detail response shapes verified 2026-10-02.
// Use only public recruitment endpoints; no account, cookies or private API.
export async function readTencentSources(preferences,{signal,readJSON=fetchJSON}={}){
 const query=String(preferences.query||'').replace(/腾讯|tencent/gi,'').trim().slice(0,150),city=String(preferences.city||'').trim();
 const search=new URL('https://careers.tencent.com/tencentcareer/api/post/Query');search.search=new URLSearchParams({keyword:query,pageIndex:'1',pageSize:'30',language:'zh-cn',area:'cn'}).toString();
 const data=await readJSON(search.href,{signal});if(data.Code!==200||!Array.isArray(data.Data?.Posts))return [];
 const candidates=data.Data.Posts.filter(p=>p.IsValid===true&&typeof p.PostId==='string'&&/^\d+$/.test(p.PostId)&&(!city||String(p.LocationName).includes(city))).slice(0,6),sources=[];
 for(let i=0;i<candidates.length;i+=3){const batch=await Promise.allSettled(candidates.slice(i,i+3).map(async post=>{
  const detailURL=new URL('https://careers.tencent.com/tencentcareer/api/post/ByPostId');detailURL.search=new URLSearchParams({postId:post.PostId,language:'zh-cn'}).toString();
  const response=await readJSON(detailURL.href,{signal}),p=response.Data;if(response.Code!==200||!p||p.PostId!==post.PostId||!p.RecruitPostName||!p.Responsibility||p.IsValid===false)return null;
  const raw=new URL(p.PostURL||post.PostURL);if(raw.hostname!=='careers.tencent.com'||raw.pathname!=='/jobdesc.html'||raw.searchParams.get('postId')!==post.PostId)return null;raw.protocol='https:';const url=publicURL(raw.href);if(!url)return null;
  const text=['公司：腾讯','职位：'+p.RecruitPostName,'工作地点：'+p.LocationName,'经验要求：'+(p.RequireWorkYearsName||''),'岗位职责：\n'+p.Responsibility,'任职要求：\n'+(p.Requirement||''),'官网更新时间：'+(p.LastUpdateTime||'')].join('\n');
  return {url,title:p.RecruitPostName+' · 腾讯招聘',text,official:true};
 }));for(const result of batch)if(result.status==='fulfilled'&&result.value)sources.push(result.value);}
 return sources;
}
export async function readOfficialSources(preferences,sources,options={}){
 const tencent=/腾讯|tencent/i.test(String(preferences.companies||'')+' '+String(preferences.query||''))||sources.some(s=>new URL(s.url).hostname==='careers.tencent.com');
 if(!tencent)return [];try{return await readTencentSources(preferences,options);}catch(error){if(options.signal?.aborted)throw error;return [];}
}

