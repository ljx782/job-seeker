import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const config=await(await fetch(base+'/api/config')).json();
const response=await fetch(base+'/api/jobs/discover',{method:'POST',headers:{'Content-Type':'application/json','X-Jobseeker-Token':config.csrfToken},body:JSON.stringify({consent:true,preferences:{query:'前端开发工程师',companies:'腾讯',city:'深圳',employment:'社招',skills:'React JavaScript'}}),signal:AbortSignal.timeout(240000)});
const data=await response.json();if(!response.ok)throw new Error(data.error||'Discovery failed');
assert.ok(Array.isArray(data.sources)&&data.sources.length>0);for(const job of data.jobs){assert.equal(job.source,'web');assert.ok(job.evidence&&job.url.startsWith('https:'));assert.equal(job.postedAt,'');}
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/discovery-live.json',import.meta.url),JSON.stringify(data,null,2));
console.log(JSON.stringify({sources:data.sources.length,readable:data.stages[1].count,jobs:data.jobs.map(j=>({title:j.title,company:j.company,url:j.url,evidence:j.evidence})),summary:data.summary},null,2));

