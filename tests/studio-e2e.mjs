import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {sampleProfile} from '../js/storage.js';
import {extractResume} from '../server/documents.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',artifacts=fileURLToPath(new URL('../artifacts/',import.meta.url));await mkdir(artifacts,{recursive:true});
const config=await(await fetch(base+'/api/config')).json();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,locale:'zh-CN',reducedMotion:'reduce'});
await context.route('**/api/config',route=>route.fulfill({json:{...config,defaultMode:'demo'}}));
const calls=[];
await context.route('**/api/ai',async route=>{
  const request=route.request(),{task,payload}=request.postDataJSON();calls.push(task);assert.equal(request.headers().authorization,undefined);assert.ok(request.headers()['x-jobseeker-token']);
  const results={
    resumeParse:{profile:{...sampleProfile(),name:'导入测试同学',isSample:false},warnings:['请核对识别结果']},
    resumeReview:{score:78,summary:'经历有基础，可以进一步明确个人贡献。',strengths:['提供了项目案例'],issues:[{title:'说明你的具体行动',evidence:'项目描述未明确个人贡献',suggestion:'写明你负责的界面或功能。'}],keywords:{matched:['React'],missing:['自动化测试']},nextSteps:['补充可核实的测试案例']},
    star:{situation:'课程项目需要检索功能',task:'实现笔记搜索',action:'使用 React 完成检索界面',result:'完成可运行的原型',missing:['是否有验证记录？'],facts:[{section:'projects',text:'使用 React 完成笔记检索原型。',source:'AI-INFER',sourceRef:'测试原始素材'}]},
    resumeCoach:{answer:'建议用具体行动说明你的贡献，不增加没有依据的数据。',followUps:['你具体负责哪个模块？'],suggestedFacts:[{section:'summary',text:'重视产品体验，具有 React 项目实践经验。',source:'AI-INFER',sourceRef:'档案原始信息'}]},
    resume:{facts:[{section:'summary',text:payload.profile?.summary||'真实简介',source:'USER',sourceRef:'用户简介'},{section:'projects',text:'结合目标岗位整理的项目表达，仍需核实。',source:'AI-INFER',sourceRef:'项目经历'}]},
    connection:{ok:true}
  };
  assert.ok(results[task],`Unexpected task ${task}`);await route.fulfill({json:{result:results[task],model:'qwen-plus'}});
});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(base+'/#/resume');await page.locator('#resume-wall').waitFor();assert.equal(await page.locator('.library-card').count(),0);
  await page.getByRole('button',{name:'编辑与定制',exact:true}).click();
  const wordPromise=page.waitForEvent('download');await page.locator('#export-docx').click();const word=await wordPromise;const docxBuffer=await readFile(await word.path());const extracted=await extractResume({filename:'export.docx',content:docxBuffer.toString('base64')});assert.ok(extracted.text.includes('林一'));
  await page.locator('#save-version').click();await page.getByText('简历版本已保存在本机，可在投递记录中关联',{exact:true}).waitFor();
  await page.getByRole('button',{name:'简历库',exact:true}).click();await page.locator('.library-card').waitFor();
  await page.locator('#resume-upload').setInputFiles({name:'原始简历.txt',mimeType:'text/plain',buffer:Buffer.from('测试同学\n前端工程师\n真实项目：使用 React 开发检索界面。')});await page.locator('#save-original').click();await page.locator('.kind-original').waitFor();
  let original=page.locator('.kind-original'),manual=page.locator('.kind-manual');await manual.dragTo(original);await page.waitForFunction(()=>document.querySelector('.library-card')?.classList.contains('kind-manual'));
  await page.reload();await page.locator('.kind-original').waitFor();assert.ok((await page.locator('.library-card').first().getAttribute('class')).includes('kind-manual'));
  await page.locator('.kind-original [data-trash]').click();await page.getByText('已移入回收站，可随时恢复',{exact:true}).waitFor();await page.locator('#toggle-trash').click();await page.locator('[data-restore-trash]').click();await page.getByText('版本已恢复',{exact:true}).waitFor();await page.locator('#toggle-trash').click();await page.locator('.kind-original').waitFor();
  await page.screenshot({path:path.join(artifacts,'studio-library.png'),fullPage:true});
  await page.locator('#settings-link').click();await page.locator('[name=mode][value=live]').check();await page.locator('#ai-settings-form [name=provider]').selectOption('qwen-local');await page.locator('#ai-settings-form [name=consent]').check();await page.getByRole('button',{name:'保存设置',exact:false}).click();assert.equal(await page.locator('[name=apiKey]').isVisible(),false);
  await page.locator('#desktop-nav [data-nav=resume]').click();await page.locator('.kind-original [data-preview]').first().click();await page.locator('#parse-original').click();await page.locator('#apply-import').waitFor();await page.locator('#apply-import').click();await page.locator('#profile-form [name=name]').waitFor();assert.equal(await page.locator('#profile-form [name=name]').inputValue(),'导入测试同学');assert.ok(await page.locator('.resume-fact:not(.pending)').count()>0);
  await page.locator('#generate-resume').click();await page.getByText('AI 内容已生成，请逐条核实再确认',{exact:true}).waitFor();assert.equal(await page.locator('.resume-fact.pending').count(),2);
  await page.getByRole('button',{name:'个人素材',exact:true}).click();await page.locator('#material-form [name=title]').fill('笔记搜索项目');await page.locator('#material-form [name=text]').fill('课程项目中使用 React 完成笔记搜索界面，交付可运行原型。');await page.getByRole('button',{name:'保存素材',exact:true}).click();await page.locator('.material-note').filter({hasText:'笔记搜索项目'}).locator('[data-edit-material]').click();await page.locator('#structure-star').click();await page.locator('#apply-star').waitFor();await page.locator('#apply-star').click();await page.screenshot({path:path.join(artifacts,'studio-materials.png'),fullPage:true});
  await page.getByRole('button',{name:'AI 顾问',exact:true}).click();await page.locator('#coach-form textarea').fill('请润色我的简介');await page.locator('#coach-form button').click();await page.locator('.coach-message.assistant').waitFor();await page.locator('[data-apply-coach]').click();await page.screenshot({path:path.join(artifacts,'studio-coach.png'),fullPage:true});
  await page.locator('#diagnose-current').click();await page.locator('#review-jd').fill('前端工程师，React，自动化测试');await page.locator('#run-review').click();await page.locator('.review-overview').waitFor();assert.ok((await page.locator('#review-result').innerText()).includes('78'));await page.screenshot({path:path.join(artifacts,'studio-review.png'),fullPage:true});await page.getByRole('button',{name:'关闭对话框'}).click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('jobpilot.workspace.v1')).resume.facts.length);await page.getByRole('button',{name:'简历库',exact:true}).click();await page.locator('.kind-manual [data-preview]').first().click();await page.locator('#edit-version').click();await page.locator('#profile-form [name=name]').waitFor();assert.equal(await page.locator('#profile-form [name=name]').inputValue(),'林一');
  await page.getByRole('button',{name:'简历库',exact:true}).click();await page.locator('.kind-draft').first().waitFor();assert.ok(await page.locator('.kind-draft').count()>=2);assert.ok(before>2);
  await page.setViewportSize({width:390,height:844});for(const [id,name] of [['library','简历库'],['materials','个人素材'],['editor','编辑与定制'],['coach','AI 顾问']]){await page.getByRole('button',{name,exact:true}).click();if(id==='library')await page.locator('#resume-wall').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' overflow');await page.screenshot({path:path.join(artifacts,`studio-mobile-${id}.png`),fullPage:true});}
  assert.ok(!await page.evaluate(()=>localStorage.getItem('jobpilot.workspace.v1').includes('sk-ws-')));assert.deepEqual(errors,[]);for(const task of ['resume','resumeParse','resumeReview','resumeCoach','star'])assert.ok(calls.includes(task));
  console.log('Studio E2E passed: Word download, original import, drag persistence, trash restore, AI parse/review/coach/STAR/generation, pending-fact gating, draft preservation, and four mobile layouts. AI responses mocked; local document endpoints real.');
}catch(error){await page.screenshot({path:path.join(artifacts,'studio-e2e-failure.png'),fullPage:true});console.error(errors);console.error(await page.locator('#toast-stack').innerText());throw error;}
finally{await context.close();await browser.close();}
