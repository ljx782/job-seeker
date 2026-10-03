import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../data/',import.meta.url));await mkdir(dir,{recursive:true});
const companies=[['墨迹协作','M','sage','效率工具'],['星野科技','✳','peach','人工智能'],['拾光生活','拾','lilac','生活方式'],['山海网络','山','blue','互联网'],['知序科技','Z','sand','企业服务'],['未然设计','W','rose','创意设计'],['寻鲸数据','鲸','blue','数据服务'],['橙子互动','O','peach','数字产品'],['青禾教育','禾','sage','在线教育'],['留白工作室','L','lilac','内容创作']];
const roles=[
 ['前端工程师','前端',['React','TypeScript','CSS','Git'],20,35,'参与核心产品的前端开发，让每一次交互都清晰、流畅。',['使用 React 和 TypeScript 开发可维护的产品界面','与产品、设计团队协作，打磨组件系统和用户体验','关注性能、可访问性和跨设备适配']],
 ['产品经理','产品',['需求分析','产品设计','Figma','SQL'],18,30,'从用户问题出发，一起定义更有价值的数字产品。',['开展用户访谈并整理需求优先级','推动原型设计与产品迭代，跟进效果验证','与工程、设计和运营团队协作交付']],
 ['UI / UX 设计师','设计',['Figma','交互设计','视觉设计','用户研究'],16,28,'用细腻的设计思考，为真实的用户问题找到答案。',['搭建清晰的交互流程与高质量视觉稿','参与设计系统建设，保持跨端体验一致','通过用户研究和可用性测试改进设计']],
 ['后端开发工程师','后端',['Java','Spring Boot','MySQL','Redis'],22,38,'参与稳定、可扩展的服务建设，把好想法落地。',['设计并实现业务接口与数据模型','关注服务性能、稳定性和可观测性','与前端协作，持续改善交付质量']],
 ['数据分析师','数据',['Python','SQL','数据分析','Tableau'],18,32,'让数据变得有解释力，为产品与业务提供方向。',['搭建指标体系与数据分析报表','通过专题分析识别增长机会与业务问题','与业务团队协作验证假设并追踪结果']],
 ['AI 应用工程师','AI',['Python','LLM','RAG','FastAPI'],25,45,'探索大模型如何真正融入日常工作与产品体验。',['开发和评估基于大模型的应用功能','完善知识检索与上下文管理流程','关注模型输出可靠性和使用体验']],
 ['全栈工程师','全栈',['React','Node.js','TypeScript','PostgreSQL'],22,40,'从界面到服务端，完整参与产品的每一次迭代。',['开发 Web 界面与服务端接口','参与数据库设计与自动化部署','与小团队紧密协作，快速验证产品想法']],
 ['内容运营','运营',['内容策划','用户运营','数据分析','文案'],12,22,'连接内容与用户，把每一次沟通变成长期关系。',['制定内容主题并跟进发布效果','维护用户社区并收集产品反馈','用数据复盘活动与内容表现']],
 ['测试开发工程师','测试',['Python','自动化测试','Playwright','Git'],16,28,'把可靠性变成产品体验的一部分。',['设计并维护自动化测试流程','定位质量问题并推动改进','参与需求评审和发布验证']],
 ['移动端工程师','移动端',['Flutter','Dart','Git','移动开发'],20,36,'把精致的产品体验带到每个人的口袋里。',['开发跨平台移动应用功能','完善性能、稳定性与设备兼容性','与设计和服务端团队共同交付']],
 ['品牌设计师','设计',['品牌设计','Illustrator','Photoshop','视觉设计'],14,26,'通过视觉语言，构建让人愿意靠近的品牌。',['参与品牌视觉体系与创意概念设计','完成数字渠道和活动视觉物料','维护品牌设计规范与素材库']],
 ['前端开发实习生','前端',['JavaScript','HTML','CSS','React'],4,7,'在真实的产品项目中，开始你的前端成长之旅。',['在导师指导下完成前端页面开发','学习组件化思维与代码质量规范','参与团队评审并持续积累工程实践']]
];
const contexts=[['企业协作平台','文档检索、权限管理与多人协作'],['交易与订单系统','订单列表、支付反馈与异常流程'],['内容社区','内容发布、搜索发现与移动端阅读'],['企业数据工作台','复杂表单、数据筛选与指标展示'],['远程协作产品','异步协作、跨时区交付与浏览器兼容']];
const cities=['上海','北京','杭州','深圳','远程'];
const jobs=[];for(let r=0;r<roles.length;r++)for(let n=0;n<5;n++){const role=roles[r],company=companies[(r*3+n)%companies.length];const i=jobs.length;const remote=n===4;const date=new Date();date.setDate(date.getDate()-(i%12));jobs.push({id:`demo-${String(i+1).padStart(3,'0')}`,company:company[0],logo:company[1],tone:company[2],industry:company[3],title:r===11?role[0]:`${role[0]} · ${contexts[n][0]}`,category:role[1],city:cities[n],remote,salaryMin:role[3]+(r===11?0:n),salaryMax:role[4]+(r===11?0:n),salaryMonths:13+(n%3),experience:r===11?'在校生':n%3===0?'1–3 年':'3–5 年',education:'本科',size:['20–99 人','100–499 人','500–999 人','1000 人以上','20–99 人'][n],skills:role[2],description:`${company[0]}正在建设${contexts[n][0]}，本岗位围绕${contexts[n][1]}开展工作。${role[5]} 团队采用需求评审、分阶段交付和复盘的协作方式。`,responsibilities:[...role[6],`结合${contexts[n][0]}的实际场景参与需求评审、交付验收与问题复盘`,r===11?'每周至少到岗 4 天，可连续实习 3 个月；提供导师指导。':n===4?'具备清晰的书面沟通习惯，能在远程团队中推进任务。':`具备${n%3===0?'1–3':'3–5'}年相关实践经验，能清楚说明个人承担的职责与交付成果。`],source:'demo',postedAt:date.toISOString(),url:''});}
await writeFile(dir+'mock-jobs.json',JSON.stringify(jobs,null,2)+'\n');
await writeFile(dir+'templates.json',JSON.stringify([{id:'tech',name:'技术 · 清晰有序',description:'突出技术技能、工程实践与项目经验'},{id:'product',name:'产品 · 结果导向',description:'优先展示工作经历与业务思考'},{id:'design',name:'设计 · 留白之间',description:'突出个人表达与项目作品'},{id:'general',name:'通用 · 简约经典',description:'适合跨行业投递的经典单栏布局'}],null,2)+'\n');
console.log(`Created ${jobs.length} clearly labeled demo jobs and 4 resume templates.`);
