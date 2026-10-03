import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readConfig } from '../server/config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'.netlify'),cli=path.join(root,'node_modules/netlify-cli/bin/run.js');
const config=readConfig();
if(!config.key)throw new Error('请先在 .env.local 配置 DASHSCOPE_API_KEY；不会创建空的线上 AI 配置。');
const state=JSON.parse(await readFile(path.join(directory,'state.json'),'utf8').catch(()=>'{"siteId":null}'));
if(!state.siteId)throw new Error('请先通过 netlify sites:create 或 netlify link 关联要发布的站点。');
await mkdir(directory,{recursive:true});
const secretsPath=path.join(directory,'cloud-secrets.json');
let secrets;
try { secrets=JSON.parse(await readFile(secretsPath,'utf8')); }
catch(error){if(error.code!=='ENOENT')throw error;secrets={JOBSEEKER_SECRET:randomBytes(32).toString('base64url')};await writeFile(secretsPath,JSON.stringify(secrets,null,2),{mode:0o600,flag:'wx'});}
if(typeof secrets.JOBSEEKER_SECRET!=='string'||secrets.JOBSEEKER_SECRET.length<32)throw new Error('本地云端密钥文件格式无效；请勿随意更换已有加密密钥。');
const values={JOBSEEKER_SECRET:secrets.JOBSEEKER_SECRET,DASHSCOPE_API_KEY:config.key,DASHSCOPE_BASE_URL:config.baseURL,DASHSCOPE_MODEL:config.model,JOBSEEKER_AI_DEFAULT_MODE:'live',JOBSEEKER_DAILY_TASK_LIMIT:'200'};
for(const [key,value] of Object.entries(values)){
  const args=[cli,'env:set',key,value,'--context','production','--force'];
  if(['JOBSEEKER_SECRET','DASHSCOPE_API_KEY'].includes(key))args.push('--secret');
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true});
  if(result.status!==0){console.error('无法设置 '+key+'；请检查 Netlify 登录、站点权限和当前套餐能力。命令输出已隐藏，避免显示密钥。');process.exit(1);}
  console.log('Configured '+key+' for production.');
}
console.log('配置完成。打开网站即可使用，无需访问密码；加密密钥保存在 .netlify/cloud-secrets.json。请私下妥善备份，不要提交这些文件。');
