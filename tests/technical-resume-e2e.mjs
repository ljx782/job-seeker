import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createServer} from '../server.mjs';
import {extractResume} from '../server/documents.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const artifacts=fileURLToPath(new URL('../artifacts/',import.meta.url));await mkdir(artifacts,{recursive:true});
const server=createServer({key:'',defaultMode:'demo',model:'',port:0});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,locale:'zh-CN'});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/#/resume`);await page.getByRole('button',{name:'编辑与定制',exact:true}).click();
 assert.equal(await page.locator('[data-step]').count(),8);await page.locator('#technical-example').click();await page.locator('#load-technical-example').click();
 await page.getByText('技术学生示例已载入，原草稿已保留在简历库',{exact:true}).waitFor();
 assert.equal(await page.locator('[name=role]').inputValue(),'AI 应用开发实习生');
 await page.locator('[data-step=education]').click();await page.locator('[name="education.0.gpa"]').fill('3.80 / 4.0');
 await page.locator('[data-step=skills]').click();await page.locator('[name="skillGroups.0.level"]').selectOption('熟练');
 await page.locator('[data-step=projects]').click();await page.locator('[name="projects.0.period"]').fill('2025.09 — 2025.12');
 await page.locator('[data-step=competitions]').click();await page.locator('[name="competitions.0.award"]').fill('区域赛一等奖（示例）');
 await page.locator('[data-step=credentials]').click();await page.locator('[name="credentials.0.detail"]').fill('520 分（示例）');
 await page.locator('[data-step=research]').click();await page.locator('[name="research.0.results"]').fill('提交可复现实验报告及代码；未发表论文。');
 await page.reload();await page.locator('#profile-form').waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('jobpilot.workspace.v1')).profile);
 assert.equal(saved.education[0].gpa,'3.80 / 4.0');assert.equal(saved.skillGroups[0].level,'熟练');assert.equal(saved.competitions[0].award,'区域赛一等奖（示例）');
 await page.locator('[data-step=basic]').click();await page.locator('[name=audience]').selectOption('research');await page.locator('#preview-finished').click();
 let headings=await page.locator('#resume-preview .resume-section h3').allTextContents();assert.deepEqual(headings.slice(0,2),['教育背景','科研经历']);
 await page.locator('[name=audience]').selectOption('student');headings=await page.locator('#resume-preview .resume-section h3').allTextContents();assert.deepEqual(headings.slice(0,2),['教育背景','专业技能']);assert.ok(!headings.includes('实习 / 工作经历'));
 await page.locator('[data-step=projects]').click();await page.screenshot({path:artifacts+'technical-studio-desktop.png',fullPage:true});
 const wordPromise=page.waitForEvent('download');await page.locator('#export-docx').click();const word=await wordPromise;assert.equal(word.suggestedFilename(),'林一-AI 应用开发实习生-江南示例大学.docx');
 const doc=await extractResume({filename:word.suggestedFilename(),content:(await readFile(await word.path())).toString('base64')});for(const text of ['科研经历','520 分','区域赛一等奖','3.80 / 4.0'])assert.ok(doc.text.includes(text));
 const mdPromise=page.waitForEvent('download');await page.locator('#export-md').click();const md=await mdPromise;assert.ok((await readFile(await md.path(),'utf8')).includes('证书与荣誉'));
 await page.evaluate(()=>{window.print=()=>{document.documentElement.dataset.pdfTitle=document.title;};});await page.locator('#export-pdf').click();assert.equal(await page.locator('html').getAttribute('data-pdf-title'),'林一-AI 应用开发实习生-江南示例大学');
 assert.deepEqual(await page.locator('#print-root .resume-section h3').allTextContents(),headings);await page.emulateMedia({media:'print'});await page.pdf({path:artifacts+'technical-resume.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});await page.emulateMedia({media:'screen'});
 await page.locator('#save-version').click();await page.getByRole('button',{name:'简历库',exact:true}).click();await page.locator('.kind-manual').waitFor();assert.equal(await page.locator('.kind-draft').count(),1);
 await page.locator('.kind-manual [data-preview]').first().click();await page.locator('#edit-version').click();await page.locator('#profile-form').waitFor();
 await page.locator('#generate-resume').click();await page.locator('#accept-originals').waitFor();await page.locator('#accept-originals').click();while(await page.locator('[data-accept]').count())await page.locator('[data-accept]').first().click();
 await page.setViewportSize({width:390,height:844});
 for(const step of ['basic','education','skills','projects','experience','competitions','credentials','research']){await page.locator(`[data-step=${step}]`).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),step+' overflow');}
 await page.locator('[data-step=skills]').click();await page.screenshot({path:artifacts+'technical-studio-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Technical resume E2E passed: eight modules, safe example loading, editing, reload, audience order, hidden empty sections, DOCX/MD/PDF filenames and contents, version restore, generation and all mobile forms.');
}catch(error){await page.screenshot({path:artifacts+'technical-resume-failure.png',fullPage:true});throw error;}
finally{await context.close();await browser.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
