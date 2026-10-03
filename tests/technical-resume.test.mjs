import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProfile,sectionOrder,resumeFilename,SECTION_IDS,profileSkillText} from '../js/resume-schema.js';
import {technicalStudentProfile} from '../js/demo-content.js';
import {initialState,validateBackup} from '../js/storage.js';
import {profileFacts,normalizeDraft,matchJob} from '../js/domain.js';
import {resumeHTML,resumeMarkdown} from '../js/resume-builder.js';
import {buildResumeDocx,extractResume} from '../server/documents.mjs';
import {AI_TASKS} from '../js/ai-prompts.js';
test('legacy profiles migrate without losing fields and new lists are independently editable',()=>{
 const p=normalizeProfile({name:'旧档案',skills:'React',projects:[{name:'旧项目',description:'旧描述'}]});assert.equal(p.projects[0].description,'旧描述');assert.deepEqual(p.research,[]);assert.deepEqual(p.skillGroups,[]);assert.equal(p.audience,'student');
 assert.throws(()=>normalizeProfile({competitions:'invalid'}));assert.equal(normalizeProfile({skillGroups:[{level:'专家',category:'编造类别',items:'Python'}]}).skillGroups[0].level,'');
});
test('all technical fields and new facts survive backup and saved-version restoration',()=>{
 const s=initialState([],false);s.profile=normalizeProfile(technicalStudentProfile());s.resume.facts=profileFacts(s.profile);s.studio.materials=[{id:'r1',title:'科研素材',text:'实验记录',section:'research'}];
 s.versions=[{id:'v1',name:'技术简历',savedAt:new Date().toISOString(),profile:s.profile,facts:s.resume.facts,template:'tech'}];
 const restored=validateBackup(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored.profile,s.profile);assert.deepEqual(restored.versions[0].profile,s.profile);assert.equal(restored.studio.materials[0].section,'research');
 for(const section of ['competitions','research','credentials'])assert.ok(restored.versions[0].facts.some(f=>f.section===section));
});
test('student, professional and research orders are shared by HTML, Markdown and Word',async()=>{
 const p=normalizeProfile(technicalStudentProfile()),r={template:'tech',facts:profileFacts(p)};
 const html=resumeHTML(p,r,{exporting:true}),md=resumeMarkdown(p,r);assert.ok(html.indexOf('教育背景')<html.indexOf('专业技能'));assert.ok(md.indexOf('教育背景')<md.indexOf('专业技能'));assert.ok(!html.includes('实习 / 工作经历'));assert.ok(html.indexOf('自我评价')>html.indexOf('证书与荣誉'));
 for(const value of ['3.72 / 4.0','专业前 12%','核心课程','区域赛二等奖','512 分','2025.10','0.83','Git']){assert.ok(html.includes(value),value);assert.ok(md.includes(value),value);}
 const buffer=await buildResumeDocx({profile:p,resume:r}),doc=await extractResume({filename:'technical.docx',content:buffer.toString('base64')});
 for(const value of ['教育背景','科研经历','证书与荣誉','区域赛二等奖','0.83','example.com/linyi/code'])assert.ok(doc.text.includes(value),value);
 assert.ok(doc.text.indexOf('教育背景')<doc.text.indexOf('专业技能'));assert.equal(sectionOrder({...p,audience:'research'})[1],'research');assert.equal(sectionOrder({...p,audience:'experienced'})[1],'experience');
});
test('new AI sections stay pending and source evidence cannot cross section boundaries',()=>{
 const p=normalizeProfile(technicalStudentProfile()),facts=profileFacts(p),input=['competitions','research','credentials'].map(section=>({section,text:'改写表达 '+section,source:'USER',sourceRef:facts.find(f=>f.section===section).sourceRef}));
 const normalized=normalizeDraft({facts:input},p);assert.equal(normalized.length,3);assert.ok(normalized.every(f=>f.status==='pending'&&f.source==='AI-INFER'&&f.originalText));
 const crossed=normalizeDraft({facts:[{section:'credentials',text:facts.find(f=>f.section==='projects').text,source:'USER'}]},p);assert.equal(crossed[0].source,'AI-INFER');
 for(const section of SECTION_IDS)assert.ok(AI_TASKS.resume.includes(section));assert.ok(AI_TASKS.resumeParse.includes('skillGroups'));
});
test('classification supports matching, filenames are safe, unrelated sensitive fields are dropped',()=>{
 const p=normalizeProfile({...technicalStudentProfile(),gender:'secret',age:20});assert.equal(p.gender,undefined);assert.ok(profileSkillText(p).includes('Python'));
 assert.ok(matchJob({skills:['Python'],title:'AI 开发',category:'AI',company:'示例',description:''},{},p).matched.includes('Python'));
 assert.equal(resumeFilename({...p,name:'林/一',role:'AI:开发'}),'林_一-AI_开发-江南示例大学.pdf');
 const r={facts:profileFacts(p),template:'tech'};p.github='javascript:alert(1)';assert.ok(!resumeHTML(p,r,{exporting:true}).includes('javascript:'));
});
