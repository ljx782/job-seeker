import {readFileSync} from 'node:fs';
import path from 'node:path';
function loadSkill(){try{return readFileSync(new URL('../skills/resume-tailor/SKILL.md',import.meta.url),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;return readFileSync(path.join(process.cwd(),'skills/resume-tailor/SKILL.md'),'utf8');}}
const resumeSkill=loadSkill().replace(/^---[\s\S]*?---\s*/, '');
export function applyTaskSkill(task,messages){if(task==='resume')messages[0].content+='\n'+resumeSkill;return messages;}
