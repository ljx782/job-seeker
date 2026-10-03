import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function walk(dir){const output=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git','artifacts','dist','.netlify'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())output.push(...await walk(file));else output.push(file);}return output;}
const files=await walk(root);let count=0;
for(const file of files.filter(file=>/\.(m?js)$/.test(file))){const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(check.status!==0){process.stderr.write(check.stderr);process.exit(1);}count++;}
for(const file of files.filter(file=>file.endsWith('.json')))JSON.parse(await readFile(file,'utf8'));
const jobs=JSON.parse(await readFile(path.join(root,'data','mock-jobs.json'),'utf8'));
if(jobs.length<50||new Set(jobs.map(j=>j.id)).size!==jobs.length||jobs.some(j=>j.source!=='demo'))throw new Error('Demo job data requirements failed.');
const index=await readFile(path.join(root,'index.html'),'utf8');
for(const match of index.matchAll(/(?:href|src)="((?:css|js|assets)\/[^"]+)"/g))await readFile(path.join(root,match[1]));
console.log(`OK: ${count} JavaScript files, valid JSON, ${jobs.length} unique demo jobs, and all entry assets.`);
