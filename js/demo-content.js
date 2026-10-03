// All identities, employers and outcomes in this fixture are fictional.
export const DEMO_REVISION = 2;
export function technicalStudentProfile(){return {
 name:'林一',role:'AI 应用开发实习生',email:'linyi@example.com',phone:'',city:'上海',github:'https://example.com/linyi/code',blog:'',website:'https://example.com/linyi/portfolio',audience:'student',isSample:true,
 summary:'用 Python 完成数据处理与分类模型实验，具备 AI 应用接口及前端原型开发实践。关注实验可复现与工具复用。',skills:'',
 skillGroups:[{category:'编程语言',level:'掌握',items:'Python, JavaScript',evidence:'用于数据清洗、接口调用及页面开发'},{category:'AI 模型与方法',level:'掌握',items:'Pandas, scikit-learn, RAG',evidence:'完成分类模型对比与检索问答原型'},{category:'框架与工具',level:'掌握',items:'FastAPI, Git, Linux',evidence:'封装预测接口并维护实验记录'},{category:'数据库',level:'了解',items:'MySQL',evidence:'完成课程项目的数据查询与表结构设计'}],
 education:[{school:'江南示例大学',major:'计算机科学与技术',degree:'本科',period:'2023.09 — 2027.06（预计）',courses:'数据结构, 计算机网络, 数据库原理, 机器学习, 概率论',gpa:'3.72 / 4.0',ranking:'专业前 12%',honors:'校级二等奖学金（2024—2025 学年，示例）'}],
 projects:[{name:'泰坦尼克生存预测实验（示例）',period:'2025.10 — 2025.12',role:'独立开发',stack:'Python / Pandas / scikit-learn',url:'',background:'基于公开乘客数据完成二分类预测，练习完整的机器学习流程。',responsibility:'负责数据清洗、特征处理、训练与验证。',actions:'处理缺失值和类别编码，将预处理与模型封装为 Pipeline；在相同划分下对比逻辑回归与随机森林。',results:'在固定随机种子的本地验证集上，准确率由 0.78 提升至 0.83；保存划分方式、参数与评估脚本，便于复现。'},
 {name:'校园资料检索助手（示例）',period:'2026.04 — 2026.06',role:'后端与检索开发',stack:'Python / FastAPI / RAG',background:'课程资料分散，希望按问题快速找到原文出处。',responsibility:'负责资料切分、检索接口与引用返回。',actions:'建立文档处理流程，封装查询接口，针对无相关证据的问题返回资料不足提示。',results:'使用 50 条人工整理的问题验证检索流程；交付带引用的问答原型与可复用数据处理模板。'}],
 experience:[],
 competitions:[{name:'高校 AI 应用挑战赛（虚构示例）',award:'区域赛二等奖',period:'2026.06',level:'省级 / 区域',track:'校园知识服务',role:'3 人团队中负责后端与检索',stack:'FastAPI / RAG',description:'基于校园资料检索助手完成参赛原型，对接队友开发的页面并演示引用查询流程。',results:'沉淀接口契约、评测问题集与复现说明；项目技术细节见项目经验。'}],
 research:[{name:'文本分类课程研究（示例）',organization:'数据智能实验室（示例）',period:'2026.03 — 2026.05',role:'学生研究助理',stack:'Python / scikit-learn',background:'比较不同文本表示在课程数据集上的分类表现。',responsibility:'负责数据检查与基线实验。',actions:'固定数据划分，对比词袋与 TF-IDF 表示，记录宏平均 F1 与误分类案例。',results:'提交可复现实验报告及代码；未发表论文。'}],
 credentials:[{name:'大学英语六级（示例）',issuer:'全国大学英语考试',period:'2025.12',detail:'512 分'},{name:'校级优秀课程项目（示例）',issuer:'江南示例大学',period:'2026.06',detail:'校园资料检索助手'}]
};}
export function demoProfile(){return {
  name:'林一',role:'前端工程师',email:'linyi@example.com',phone:'',city:'上海',website:'',isSample:true,
  summary:'做了两年前端，主要用 React 和 TS。做过企业后台和知识库，喜欢把不好用的页面改得顺手一点。',
  skills:'React, TypeScript, JavaScript, CSS, Git, Vitest, Vite',
  education:[{school:'江南示例大学',major:'计算机科学与技术',degree:'本科',period:'2020.09 — 2024.06'}],
  experience:[{company:'知序科技（示例）',position:'前端工程师',period:'2024.07 — 至今',description:'给企业客户做后台，我负责订单列表、筛选和权限页面。用 React 和 TS，把重复的表格和弹窗抽成了 8 个组件。和后端一起查过重复提交的问题，加了按钮状态和请求校验。给这些交互写了 24 个 Vitest 测试。'},
    {company:'墨迹协作（示例）',position:'前端开发实习生',period:'2023.07 — 2024.01',description:'帮团队做知识库的搜索和标签页面，用 React 和 TS。设计师给稿后我做页面，也补了键盘操作和空结果提示。跟着导师修了测试提的样式和交互问题。'}],
  projects:[{name:'拾光 · 阅读笔记',role:'独立开发',stack:'React / TypeScript / CSS / Vite',description:'自己做了个记读书笔记的网站，可以搜索、按标签找笔记，刷新后数据还在。电脑和手机都能用。找了 6 个同学试用，根据反馈改了标签入口和空页面提示。'},
    {name:'后台列表性能优化',role:'前端开发',stack:'React / TypeScript / Chrome DevTools',description:'后台订单多的时候翻页有点卡。我用 Chrome DevTools 看了渲染，拆了组件并缓存重复计算。在同一台电脑、同样的 1000 条测试数据下，切换筛选的耗时从 820ms 降到 310ms。'}]
};}

// Curated transformations are used only when the entire source matches.
const rewrites=new Map([
 ['做了两年前端，主要用 React 和 TS。做过企业后台和知识库，喜欢把不好用的页面改得顺手一点。','具备两年前端开发经验，主要使用 React 与 TypeScript，参与企业后台及知识库建设。关注界面可用性与交互体验，能够围绕具体使用问题开展前端改进。'],
 ['给企业客户做后台，我负责订单列表、筛选和权限页面。用 React 和 TS，把重复的表格和弹窗抽成了 8 个组件。和后端一起查过重复提交的问题，加了按钮状态和请求校验。给这些交互写了 24 个 Vitest 测试。','• 负责企业后台订单列表、筛选及权限页面开发，使用 React 与 TypeScript 实现业务交互。\n• 将重复的表格、弹窗逻辑沉淀为 8 个复用组件。\n• 协同后端定位重复提交问题，通过按钮状态管理与请求校验完善交互；编写 24 个 Vitest 测试覆盖相关行为。'],
 ['帮团队做知识库的搜索和标签页面，用 React 和 TS。设计师给稿后我做页面，也补了键盘操作和空结果提示。跟着导师修了测试提的样式和交互问题。','• 参与团队知识库建设，使用 React 与 TypeScript 开发搜索及标签页面。\n• 根据设计稿实现界面，补充键盘操作与空结果反馈。\n• 在导师指导下修复测试反馈的样式及交互问题。'],
 ['自己做了个记读书笔记的网站，可以搜索、按标签找笔记，刷新后数据还在。电脑和手机都能用。找了 6 个同学试用，根据反馈改了标签入口和空页面提示。','• 独立开发阅读笔记网站，实现笔记检索、标签筛选与本地数据持久化。\n• 采用响应式布局适配桌面与移动设备。\n• 邀请 6 位同学试用，依据反馈优化标签入口及空状态提示。'],
 ['后台订单多的时候翻页有点卡。我用 Chrome DevTools 看了渲染，拆了组件并缓存重复计算。在同一台电脑、同样的 1000 条测试数据下，切换筛选的耗时从 820ms 降到 310ms。','• 针对订单列表交互卡顿，使用 Chrome DevTools 分析渲染过程，通过组件拆分与计算缓存优化交互性能。\n• 在同一设备、1000 条测试数据的对比条件下，筛选切换耗时由 820ms 降至 310ms。']
]);
export function polishDemoText(value){
  const text=String(value||'').trim();if(rewrites.has(text))return rewrites.get(text);
  // Conservative offline fallback: expression and layout only, no new claims.
  return text.replace(/\bTS\b/g,'TypeScript').replace(/自己做了(?:一个|个)/g,'独立开发了').replace(/做了(?:一个|个)/g,'开发了').replace(/帮(?:助)?团队做/g,'参与团队开发').replace(/我负责/g,'负责').replace(/我用/g,'使用').replace(/刷新后数据还在/g,'支持本地数据持久化').replace(/电脑和手机都能用/g,'适配桌面与移动设备').replace(/有点卡/g,'存在交互卡顿').replace(/。\s*(?=\S)/g,'。\n');
}

export function demoMaterials(now=new Date()) {return [
 {id:'demo-material-performance',title:'列表性能优化的测试条件',section:'projects',text:'同一台电脑，1000 条测试订单；Chrome DevTools 记录筛选切换耗时 820ms → 310ms。只说明这个测试场景，不推断所有用户的体验。',savedAt:now.toISOString()},
 {id:'demo-material-components',title:'从重复页面整理组件',section:'experience',text:'订单和权限页面里表格、弹窗写法重复，我整理了 8 个复用组件，也补了 24 个交互测试。没有统计节省工时。',savedAt:now.toISOString()}
];}

export function demoApplications(jobs,now=new Date()){
 const statuses=['saved','saved','applied','applied','screening','test','interview','interview','offer','rejected','rejected','applied'];
 const candidates=jobs.filter(j=>j.source==='demo'&&['前端','全栈','测试'].includes(j.category));
 const notes=['已收藏，准备突出组件复用经验。','需补充作品介绍，准备后再投递。','已通过招聘入口提交，等待简历筛选。','已提交技术方向简历，计划一周后跟进。','招聘方已完成初筛，等待下一轮安排。','收到前端实作测评，准备表单与测试题。','技术一面：准备组件设计和性能优化案例。','二面：复盘跨团队协作与需求取舍。','已收到意向录用，待确认薪资结构与到岗日期。','岗位方向调整，本轮流程结束。','本轮未通过，复盘项目深度与表达。','刚提交申请，等待招聘方处理。'];
 const at=days=>new Date(+now-days*86400000).toISOString();
 return statuses.slice(0,candidates.length).map((status,i)=>{
  const j=candidates[i],age=3+i*2,history=[{status:'saved',at:at(age)}];
  if(status!=='saved')history.push({status:'applied',at:at(age-1)});
  if(['screening','test','interview','offer'].includes(status))history.push({status:'screening',at:at(age-2)});
  if(['test','interview','offer'].includes(status))history.push({status:'test',at:at(age-3)});
  if(['interview','offer'].includes(status))history.push({status:'interview',at:at(age-5)});
  if(['offer','rejected'].includes(status))history.push({status,at:at(1)});
  return {id:`demo-application-${i+1}`,jobId:j.id,company:j.company,title:j.title,city:j.city,category:j.category,status,channel:i%2?'招聘官网（演示）':'招聘邮箱（演示）',createdAt:history[0].at,updatedAt:history.at(-1).at,appliedAt:history.find(h=>h.status==='applied')?.at||null,interviewAt:status==='interview'?new Date(+now+(i===6?20:68)*3600000).toISOString():'',offerDeadline:status==='offer'?new Date(+now+40*3600000).toISOString():'',notes:`【虚构演示】${notes[i]}`,resumeVersion:'',history,isSample:true};
 });
}
