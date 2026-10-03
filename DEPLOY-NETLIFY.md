# Netlify 完整部署

适用于 2026-10-03 的当前代码。前端、AI、联网搜岗、文档处理与邮箱后端均已适配 Netlify；真实第三方服务可用性仍取决于密钥、模型权限和邮箱授权。

## 架构与使用范围

- Netlify 发布 dist 中的页面；/api/* 由 api Function 处理。
- AI、搜岗、文档导入、邮箱连接/同步/发送通过 Background Functions 执行，前端查询结果。
- QQ / 163 邮箱由生产环境的计划任务约每 2 分钟检查一次。已有同步任务运行时顺延，每邮箱每轮最多处理 8 封候选邮件；首轮覆盖最近 7 天。
- Netlify Blobs 保存 AES-256-GCM 加密后的邮箱凭据、游标、草稿、回执、上传与任务；条件写入和持久化租约串行处理同一工作区的邮件操作。
- SMTP 发送前先持久化 sending 状态。发送结果不确定时禁止自动重发；需核对回执或邮箱发件记录。
- 打开链接即可进入，无需账号或访问密码。服务器自动签发匿名访客 Cookie；邮箱工作区、上传和任务按访客隔离。个人简历、手账、版本库仍保存在各自浏览器；不会自动跨设备同步。

## 当前项目

站点名称：jobseeker-ljx782
团队：Future（ljx782）
站点地址：https://jobseeker-ljx782.netlify.app
管理页面：https://app.netlify.com/projects/jobseeker-ljx782

发布与验证：2026-10-03 已上线；68 项测试通过，真实 AI、联网搜岗（10 个岗位 / 10 个来源）、Word 与 PDF 已验证。邮箱待用户连接后完成真实收发验收。

不要只把 dist 拖入 Netlify Drop 来部署完整版：这种方式不会上传后端 Functions。

## 首次部署到自己的新站点

在 job-pilot 目录执行（需要 Node.js 24、Netlify 账号）：

    npm ci
    npx netlify login
    npx netlify sites:create --name 你的唯一站点名 --account-slug 你的团队标识
    npm run netlify:configure
    npm run check
    npm test
    npx netlify build --offline
    npm run deploy:netlify

已有站点用 npx netlify link 关联，不要再次创建。当前目录已经关联上方站点。

netlify:configure 会读取本机 .env.local 中现有千问配置，为 production 环境设置变量。它仅输出变量名，隐藏值；会在 .netlify 目录生成并复用云端加密密钥，不再生成访问密码。脚本不会设置邮箱授权码，邮箱通过网站设置页连接。

### 需要的环境变量

| 变量 | 用途 |
| --- | --- |
| DASHSCOPE_API_KEY | 千问 API Key，使用服务端代理 |
| DASHSCOPE_BASE_URL | 与密钥地域匹配的官方兼容接口，默认沿用本机配置 |
| DASHSCOPE_MODEL | 默认沿用本机模型 |
| JOBSEEKER_SECRET | 会话签名与云端数据加密，至少 32 字符 |
| JOBSEEKER_AI_DEFAULT_MODE | 统一 AI 体验，生产环境设为 `live` |
| JOBSEEKER_DAILY_TASK_LIMIT | 默认 200，滚动 24 小时内的手动 AI/搜岗任务与实际邮件识别批次数上限；不是金额上限 |

两个敏感变量通过 Netlify Secret 标记保存。当前配置不要求额外数据库账号或第三方后端。Netlify 自动提供 Blobs 的运行时访问凭证与部署地址，无需在前端放任何令牌。

加密密钥在 .netlify/cloud-secrets.json，该文件被 Git 和前端打包排除，请私下备份，不要公开。**不要丢弃或随意更换 JOBSEEKER_SECRET，否则已有云端记录无法解密。** 旧版 JOBSEEKER_ACCESS_PASSWORD 和 access-password.txt 已不再使用，存在与否不影响免登录访问。

环境变量修改后需要重新发布。升级前的共享密码会话会自动替换为匿名访客会话；旧邮箱记录仍加密保留，不会向新访客公开，需在原浏览器重新连接邮箱。

## 日常更新

    npm run check
    npm test
    npm run deploy:netlify

该命令以 production 上下文构建并发布前端和 Functions。通常不需要再次登录或重新设置密钥。

也可以把项目提交到自己的 Git 仓库后关联 Netlify 自动部署：Base directory 为项目根目录（上层仓库则填 job-pilot），Build command 为 npm run build，Publish directory 为 dist，Functions directory 为 netlify/functions。其余设置已经在 netlify.toml 中。不要把 npm start 设为构建命令。

.gitignore 排除了 .env*、node_modules、dist、.netlify 和 artifacts；提交前仍要检查 Git 已跟踪文件。没有将本机的 .env.local 上传成静态资源。页面使用 hash 路由，不需要将 /api/* 重写为 index.html。

## 上线后的第一次使用

1. 直接打开站点链接，自动进入工作台。
2. 千问 AI 已由云端统一配置，无需密钥或模式切换。示例岗位、示例档案和真实资料均可直接使用 AI 匹配、简历优化与分析；点击功能会发送该任务所需数据。
3. 发现岗位切换联网搜索，输入职位与城市。结果保留来源，无法读取的招聘页不会伪造岗位。
4. 简历文件支持 PDF、DOCX、TXT、Markdown，最大 8 MB。大文件自动分片；扫描 PDF 不支持 OCR。
5. 在设置中连接自己的 QQ / 163，填写 IMAP/SMTP 授权码。邮箱连接本身不会发送邮件。真实投递仍需核对收件人、正文、附件并点击发送确认。
6. 邮件同步在生产发布后运行；桌面通知仍需保持页面打开。邮箱授权码无效、服务未开启或网络不可达时会显示账户错误。

## 迁移本地数据

localhost 与线上域名是不同工作区。本地设置页先导出完整 JSON，再到线上设置页导入。导入会替换目标工作区，线上仍使用统一 AI 服务；导入本身不会触发 AI 请求。API Key、邮箱授权码不在备份中。同一浏览器内，线上连接的邮箱按访客 Cookie 和工作区标识恢复；更换浏览器、清除 Cookie 或创建全新工作区时需重新连接。

## 生命周期与限制

- Cookie 为 HttpOnly、Secure、SameSite=Strict，180 天到期；每次加载配置自动续期且保留访客标识，无需填写密码。POST 接口检查来源和 CSRF，后台入口校验服务端签名。
- AI 任务与文件处理保留持久化限流。工作区互斥租约为 16 分钟，以覆盖后台函数的最长执行窗口。函数异常终止后，可能需要等待租约过期再处理该工作区。
- 任务结果和上传约 1 小时内可查询；过期文件由每日后台清理执行，在过期后至少保留一天再清理。发送回执保存在邮箱工作区中，不随普通任务结果清理。
- 无登录或退出按钮。要停止收信，在设置中逐个断开邮箱；断开会移除该邮箱的授权码。清除 Cookie 不会停止云端已有同步，请在清除浏览器数据前先断开邮箱。
- 沿用原应用限制：每工作区最多 4 个邮箱，保留最近 300 条邮件进展，至多 100 份服务端投递草稿/回执；大量长期使用需要额外的回执归档策略。
- 计划任务、Blobs、Functions 和 AI 均受账号额度限制。每日任务上限不是金额承诺；请在各自控制台监控用量。
- 网络中断或取消前端等待不会撤销已发出的邮件；请以回执和邮箱记录核实，勿重复发送。

## 验证与排查

- npm run check：语法、演示数据和入口资源。
- npm test：原功能与免登录会话、跨访客隔离、加密、并发控制、分片、冷启动、回执幂等测试。
- npx netlify build --offline：构建前端和打包 Functions，不发布。
- 首次访问 /api/config 应返回 200 并自动设置访客 Cookie，返回 `defaultMode: live` 和 `unifiedAI: true`，不应出现密码页或模式选择；云端加密配置缺失返回 503，千问密钥未配置时 `configured` 为 false。
- 新设置的变量不生效：确认 production 上下文并重新发布。
- 后台任务一直等待：检查 Functions 日志、Background Functions 可用性、函数配额和部署环境变量；不要把 worker 当成静态文件。
- 千问错误：核对 Key 的地域、Base URL、模型权限和余额。联网搜索需模型支持对应搜索接口。
- 邮箱错误：确认开启 IMAP/SMTP、使用授权码而非登录密码、允许第三方客户端；真实收发需用自己的邮箱完成验收。
- 发布包检查：dist 无 .env.local / server.mjs；Functions 包只含运行代码、依赖和简历提示词，不含 .env.local 或本机云端密钥文件。

## 官方参考

- 构建配置：https://docs.netlify.com/build/configure-builds/file-based-configuration/
- Functions 限制：https://docs.netlify.com/build/functions/configuration/
- 后台函数：https://docs.netlify.com/build/functions/background-functions/
- Netlify Blobs：https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- 计划任务：https://docs.netlify.com/build/functions/scheduled-functions/
