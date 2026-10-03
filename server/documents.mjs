import path from 'node:path';
import {createRequire} from 'node:module';
import { SECTION_LABELS, sectionOrder, contactValues } from '../js/resume-schema.js';
import { ServiceError } from './ai.mjs';
import { confirmedFacts } from '../js/domain.js';
export async function extractResume({filename,content}){
  if(typeof filename!=='string'||typeof content!=='string')throw new ServiceError('请选择一份简历文件');
  const bytes=Buffer.from(content,'base64');if(!bytes.length||bytes.length>8*1024*1024)throw new ServiceError('文件最大支持 8 MB',413);
  const extension=filename.toLowerCase().split('.').at(-1);let text='',pages=1;
  if(['txt','md'].includes(extension))text=bytes.toString('utf8');
  else if(extension==='docx'){
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new ServiceError('文件不是有效的 DOCX');
    const mammoth=await import('mammoth');try{text=(await mammoth.default.extractRawText({buffer:bytes})).value;}catch{throw new ServiceError('无法解析该 Word 文件，请另存为 DOCX 再试');}
  }else if(extension==='pdf'){
    if(!bytes.subarray(0,8).toString().startsWith('%PDF'))throw new ServiceError('文件不是有效的 PDF');
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdfRoot=path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));let doc,loadingTask;
    try{loadingTask=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,verbosity:0,cMapUrl:pdfRoot.split(path.sep).join('/')+'/cmaps/',cMapPacked:true,standardFontDataUrl:pdfRoot.split(path.sep).join('/')+'/standard_fonts/'});doc=await loadingTask.promise;pages=doc.numPages;if(pages>20)throw new ServiceError('简历最多支持 20 页，请截取相关内容');const parts=[];for(let i=1;i<=pages;i++){const page=await doc.getPage(i);const data=await page.getTextContent();parts.push(data.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));}text=parts.join('\n\n');}
    catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError(error.name==='PasswordException'?'此 PDF 有密码保护，请解锁后导入':'无法解析该 PDF，请复制文本或另存为标准 PDF');}
    finally{await loadingTask?.destroy();}
  }else throw new ServiceError('支持 PDF、DOCX、TXT 和 Markdown');
  text=text.replace(/\0/g,'').trim();if(!text)throw new ServiceError('没有提取到文字。扫描件暂不支持 OCR，请粘贴可复制的文本');if(text.length>100000)throw new ServiceError('最多支持 10 万字符，请仅保留求职相关内容');
  return{text,filename:filename.slice(0,200),pages,characters:text.length};
}
export async function buildResumeDocx({profile={},resume={}}){
  const {Document,Packer,Paragraph,TextRun,BorderStyle}=await import('docx');
  const facts=confirmedFacts(Array.isArray(resume.facts)?resume.facts:[]);if(!String(profile.name||'').trim()||!facts.length)throw new ServiceError('请填写姓名并确认内容后再导出');
  const labels=SECTION_LABELS;
  const run=(text,options={})=>new TextRun({text:String(text||''),font:{ascii:'Calibri',eastAsia:'Microsoft YaHei'},...options});
  const paragraphs=[new Paragraph({children:[run(profile.name,{size:52,bold:true,color:'28332E'})],spacing:{after:120}}),new Paragraph({children:[run(profile.role,{size:22,color:'718264'})],spacing:{after:100}}),new Paragraph({children:[run(contactValues(profile).join(' · '),{size:18,color:'7F867A'})],spacing:{after:260},border:{bottom:{color:'8F9D80',size:12,style:BorderStyle.SINGLE,space:12}}})];
  for(const section of sectionOrder(profile,resume)){
    const label=labels[section],rows=facts.filter(f=>f.section===section);if(!rows.length)continue;
    paragraphs.push(new Paragraph({children:[run(label,{size:24,bold:true,color:'66785D'})],keepNext:true,spacing:{before:200,after:90},border:{bottom:{color:'E4E7DD',size:4,style:BorderStyle.SINGLE,space:5}}}));
    for(const fact of rows){const lines=String(fact.text).split('\n').filter(Boolean);lines.forEach((line,i)=>{
      const heading=i===0&&!['summary','skills'].includes(section),bullet=line.startsWith('• ');
      paragraphs.push(new Paragraph({children:[run(line,{size:21,bold:heading,color:heading?'28332E':'404A3E'})],keepNext:heading&&lines.length>1,indent:bullet?{left:200,hanging:200}:undefined,spacing:{before:heading?80:0,after:70,line:290},widowControl:true}));
    });}
  }
  return Packer.toBuffer(new Document({creator:'Jobseeker · 寻职者',title:`${profile.name} · 简历`,description:'仅包含已确认的简历内容',sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:850,right:850,bottom:850,left:850}}},children:paragraphs}]}));
}
