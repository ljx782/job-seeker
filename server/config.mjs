import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function readConfig(env=process.env,{localFile=true}={}){
  const fileValues={};
  try{if(localFile)for(const line of readFileSync(fileURLToPath(new URL('../.env.local',import.meta.url)),'utf8').split(/\r?\n/)){const match=line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(match)fileValues[match[1]]=match[2].replace(/^(["'])(.*)\1$/,'$2').trim();}}
  catch(error){if(error.code!=='ENOENT')throw new Error('无法读取本机 AI 配置文件');}
  const get=key=>env[key]??fileValues[key]??'';
  const key=get('DASHSCOPE_API_KEY'),baseURL=(get('DASHSCOPE_BASE_URL')||'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/,'');
  const url=new URL(baseURL);
  const validHost=['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','dashscope-us.aliyuncs.com'].includes(url.hostname)||/^[a-z0-9-]+\.(cn-beijing|ap-southeast-1|ap-northeast-1|cn-hongkong)\.maas\.aliyuncs\.com$/.test(url.hostname);
  if(url.protocol!=='https:'||!validHost||url.username||url.password||url.search||url.hash||url.pathname!=='/compatible-mode/v1')throw new Error('千问地址必须是阿里云官方 compatible-mode/v1 地址');
  // The hosted experience keeps AI enabled for both seeded demo records and
  // user data.  A configurable value is retained for local development, but
  // the default now matches the unified Netlify experience.
  return{key,baseURL,model:get('DASHSCOPE_MODEL')||'qwen-plus',defaultMode:get('JOBSEEKER_AI_DEFAULT_MODE')||'live',port:Number(get('PORT')||4173)};
}
