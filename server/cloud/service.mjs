import { randomUUID } from 'node:crypto';
import { CloudError, cloudSecurity, enforceOrigin, requireCsrf, same } from './security.mjs';
import { encryptedStore, mutate, rateLimit, withLease } from './store.mjs';
import { readConfig } from '../config.mjs';
import { ServiceError, requestQwen } from '../ai.mjs';
import { discoverJobs } from '../discovery.mjs';
import { extractResume, buildResumeDocx } from '../documents.mjs';
import { createMailboxManager, readRecruitmentMail } from '../mail.mjs';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const UUID = /^[a-zA-Z0-9-]{20,100}$/;
const TASK_ROUTES = new Set(['/api/ai', '/api/jobs/discover', '/api/resume/extract', '/api/mail/connect', '/api/mail/disconnect', '/api/mail/sync', '/api/mail/prepare', '/api/mail/send']);
const json = (status, data, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
const binary = value => new Response(value, { headers: { 'Content-Type': DOCX, 'Content-Disposition': 'attachment; filename=resume.docx', 'Cache-Control': 'no-store' } });
const workspace = data => { if (!UUID.test(data.workspaceId || '')) throw new CloudError('工作区标识无效'); return data.workspaceId; };
const safeError = error => ({ error: error instanceof CloudError || error instanceof ServiceError ? error.message : '云端服务暂时无法完成操作，请稍后重试', status: Number(error.status) || 500, code: error.code || 'CLOUD_ERROR' });
async function body(request, limit = 250000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new CloudError('仅支持 JSON 请求', 415);
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) throw new CloudError('请求内容过大', 413);
  try { const data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { throw new CloudError('请求必须是 JSON 对象'); }
}

export function createCloudService({ store, env = process.env, fetchImpl = fetch, services = {} }) {
  const security = cloudSecurity(env), vault = encryptedStore(store, security), config = readConfig(env, { localFile: false });
  const ai = services.ai || ((configuration,task,payload,options={}) => requestQwen(configuration,task,payload,{...options,timeout:210000}));
  const discover = services.discover || ((configuration,preferences) => discoverJobs(configuration,preferences,{ai}));
  const workerOrigin = () => { const url = new URL(env.DEPLOY_URL || env.URL || ''); if (url.protocol !== 'https:') throw new CloudError('云端工作任务地址尚未配置', 503); return url.origin; };
  const mailDependencies = { readMail: (a, apps) => readRecruitmentMail(a, apps, { maxMessages: 8 }), ...services.mail, ai: async (...args) => { await rateLimit(vault, 'tasks-day', dailyLimit(), 86400000); return (services.mail?.ai || requestQwen)(...args); } };
  const mailbox = initialState => createMailboxManager(config, { ...mailDependencies, interval: 0, autoSync: false, initialState });
  async function trigger(taskId) {
    const response = await fetchImpl(workerOrigin() + '/.netlify/functions/worker-background', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jobseeker-Worker': security.sign('worker', taskId) }, body: JSON.stringify({ taskId }), signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (response.status !== 202 && !response.ok) throw new CloudError('后台任务未能启动，请稍后重试', 503);
  }
  async function queue(path, payload, { scheduled = false, owner = null } = {}) {
    if (!TASK_ROUTES.has(path)) throw new CloudError('任务类型无效');
    if (path.startsWith('/api/mail/')) workspace(payload);
    if (!scheduled) {
      await rateLimit(vault, 'tasks-minute', 30);
      if (path === '/api/ai' || path === '/api/jobs/discover') await rateLimit(vault, 'tasks-day', dailyLimit(), 86400000);
    }
    // Reusing a delivery token reuses its task as well as its durable send receipt.
    const taskId = path === '/api/mail/send' ? security.sign('send-task', workspace(payload) + ':' + payload.token) : randomUUID();
    const key = 'tasks/' + taskId, now = Date.now();
    const record = { path, payload, owner, state: 'queued', createdAt: now, expiresAt: now + 3600000 };
    const created = await vault.write(key, record, { onlyIfNew: true });
    if (created.modified) {
      try { await trigger(taskId); }
      catch (error) {
        // A network timeout does not prove that the worker was not started.
        // Keep the queued task; authenticated polling can dispatch it again.
        if (error instanceof CloudError && error.status !== 503) throw error;
      }
    }
    return { taskId, state: 'queued' };
  }
  function dailyLimit() { const n = Number(env.JOBSEEKER_DAILY_TASK_LIMIT || 200); return Number.isInteger(n) && n > 0 && n <= 10000 ? n : 200; }
  async function mailSnapshot(id) {
    const row = await vault.read('mail/' + id), manager = mailbox(row?.value);
    return { manager, value: row?.value };
  }
  async function mailOperation(path, data) {
    const id = workspace(data);
    return withLease(vault, 'mail-' + id, async () => {
      const stateKey = 'mail/' + id, saved = await vault.read(stateKey);
      const m = createMailboxManager(config, { ...mailDependencies, interval: 0, autoSync: false, initialState: saved?.value, checkpoint: state => vault.write(stateKey, state) });
      try {
        const apps = data.applications || (await vault.read('applications/' + id))?.value || [];
        m.update(id, apps);
        let result;
        if (path.endsWith('/connect')) { result = await m.connect(id, data); await vault.write(stateKey, m.snapshot()); result = await m.sync(id); }
        else if (path.endsWith('/disconnect')) result = m.disconnect(id, data.accountId);
        else if (path.endsWith('/sync')) result = await m.sync(id);
        else if (path.endsWith('/prepare')) result = await m.prepare(id, data);
        else if (path.endsWith('/send')) result = await m.send(id, data.token, data.confirmed);
        else throw new CloudError('邮箱接口不存在', 404);
        return result;
      } finally { await vault.write(stateKey, m.snapshot()); m.close(); }
    });
  }
  async function ownedUpload(id, owner) {
    if (!UUID.test(id || '')) throw new CloudError('上传标识无效');
    const manifest = (await vault.read('uploads/' + id))?.value;
    if (!owner || !manifest || manifest.owner !== owner) throw new CloudError('找不到此文件，请重新选择文件', 404);
    if (manifest.expiresAt < Date.now()) throw new CloudError('上传已过期，请重新选择文件', 410);
    return manifest;
  }
  async function reconstructUpload(data, owner) {
    if (!data.uploadId) return data;
    if (!UUID.test(data.uploadId)) throw new CloudError('上传标识无效');
    const key = 'uploads/' + data.uploadId, manifest = await ownedUpload(data.uploadId, owner);
    const chunks = [];
    for (let i = 0; i < manifest.total; i++) {
      const part = (await vault.read(key + '/' + i))?.value;
      if (!part || part.expiresAt < Date.now()) throw new CloudError('文件上传不完整，请重新选择文件');
      chunks.push(part.content);
    }
    return { filename: manifest.filename, content: chunks.join('') };
  }
  async function removeUpload(id) {
    const key = 'uploads/' + id, row = await vault.read(key);
    if (row) for (let i = 0; i < row.value.total; i++) await vault.remove(key + '/' + i);
    await vault.remove(key);
  }
  async function processTask(taskId) {
    if (!/^[a-zA-Z0-9_-]{20,100}$/.test(taskId)) throw new CloudError('任务标识无效');
    return withLease(vault, 'task-' + taskId, async () => {
      const key = 'tasks/' + taskId, row = await vault.read(key);
      if (!row || row.value.state === 'done' || row.value.state === 'error') return;
      const job = row.value;
      if (job.expiresAt < Date.now()) return;
      await vault.write(key, { ...job, state: 'running', startedAt: Date.now() });
      try {
        const { path, payload } = job;
        let result;
        if (path === '/api/ai') result = await ai(config, payload.task, payload.payload);
        else if (path === '/api/jobs/discover') result = await discover(config, payload.preferences);
        else if (path === '/api/resume/extract') result = await extractResume(await reconstructUpload(payload, job.owner));
        else result = await mailOperation(path, payload);
        // Remove sensitive request payloads as soon as the task finishes.
        await vault.write(key, { owner: job.owner, state: 'done', result, createdAt: job.createdAt, expiresAt: Date.now() + 3600000 });
      } catch (error) {
        await vault.write(key, { owner: job.owner, state: 'error', ...safeError(error), createdAt: job.createdAt, expiresAt: Date.now() + 3600000 });
      } finally {
        if (job.path === '/api/resume/extract' && job.payload?.uploadId) {
          const uploaded = (await vault.read('uploads/' + job.payload.uploadId))?.value;
          if (job.owner && uploaded?.owner === job.owner) await removeUpload(job.payload.uploadId);
        }
      }
    });
  }
  async function handle(request) {
    try {
      enforceOrigin(request);
      const url = new URL(request.url), path = url.pathname;
      const session = security.authenticate(request);
      if (path === '/api/config' && request.method === 'GET') {
        const auth = security.issue(session);
        return json(200, { hosting: 'netlify', configured: Boolean(config.key), provider: 'qwen-local', model: config.model, displayName: '阿里云千问 · 云端服务', defaultMode: config.defaultMode, setupId: 'qwen-netlify-ai-v2', unifiedAI: true, csrfToken: security.csrf(auth.session), capabilities: { extractResume: true, docx: true, discovery: true, mail: true, resumeSkill: 'resume-tailor', asyncTasks: true, chunkedUploads: true, unifiedAI: true }, mailSyncMinutes: 2 }, { 'Set-Cookie': auth.cookie });
      }
      if (!session) return json(401, { hosting: 'netlify', code: 'SESSION_REQUIRED', error: '页面连接需要更新，请刷新后重试' });
      if (path === '/api/tasks' && request.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!/^[a-zA-Z0-9_-]{20,100}$/.test(id)) throw new CloudError('任务标识无效');
        const row = await vault.read('tasks/' + id);
        if (!row || row.value.owner !== session.visitor) throw new CloudError('找不到此任务', 404);
        if (row.value.expiresAt < Date.now()) throw new CloudError('任务已过期，请重新操作；投递结果请先检查回执', 410);
        const job = row.value;
        if (job.state === 'queued' && Date.now() - job.createdAt > 15000) {
          try { await rateLimit(vault, 'dispatch-' + id, 1, 15000); await trigger(id); }
          catch(error) { if(error.status!==429) throw error; }
        }
        if (job.state === 'running' && Date.now() - job.startedAt > 960000) throw new CloudError('任务已超时；邮件投递请检查回执或发件记录，勿重复发送', 504);
        return json(200, { state: job.state, result: job.state === 'done' ? job.result : undefined, error: job.error, status: job.status });
      }
      if (request.method !== 'POST') throw new CloudError('此接口只接受 POST', 405);
      requireCsrf(request, session, security);
      const data = await body(request, path === '/api/uploads/chunk' ? 2200000 : path === '/api/resume/extract' ? 4500000 : 250000);
      if (path.startsWith('/api/mail/')) {
        const clientWorkspace = workspace(data);
        data.workspaceId = 'visitor-' + Buffer.from(security.sign('workspace', JSON.stringify([session.visitor, clientWorkspace])), 'base64url').toString('hex');
      }
      if (path === '/api/uploads/start') {
        await rateLimit(vault, 'upload', 10);
        if (!Number.isInteger(data.total) || data.total < 1 || data.total > 6 || typeof data.filename !== 'string' || !/\.(pdf|docx|txt|md)$/i.test(data.filename)) throw new CloudError('不支持的文件或文件过大');
        const uploadId = randomUUID();
        await vault.write('uploads/' + uploadId, { owner: session.visitor, filename: data.filename.slice(0,200), total: data.total, expiresAt: Date.now() + 3600000 });
        return json(200, { uploadId });
      }
      if (path === '/api/uploads/chunk') {
        if (!UUID.test(data.uploadId || '')) throw new CloudError('上传标识无效');
        const key = 'uploads/' + data.uploadId, manifest = await ownedUpload(data.uploadId, session.visitor);
        if (!Number.isInteger(data.index) || data.index < 0 || data.index >= manifest.total || typeof data.content !== 'string' || data.content.length > 2000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.content)) throw new CloudError('文件分片无效');
        const result = await vault.write(key + '/' + data.index, { content: data.content, expiresAt: manifest.expiresAt }, { onlyIfNew: true });
        if (!result.modified) throw new CloudError('分片已存在，请重新选择文件上传', 409);
        return json(200, { ok: true });
      }
      if (path === '/api/mail/status' || path === '/api/mail/receipt' || path === '/api/mail/attachment') {
        const id = workspace(data), { manager } = await mailSnapshot(id);
        try {
          if (path.endsWith('/status')) {
            const previous = (await vault.read('applications/' + id))?.value || [];
            const result = manager.update(id, data.applications ?? previous);
            const cleaned = manager.snapshot().workspaces.find(([w]) => w === id)[1].applications;
            if (JSON.stringify(previous) !== JSON.stringify(cleaned)) await vault.write('applications/' + id, cleaned);
            return json(200, result);
          }
          if (path.endsWith('/receipt')) return json(200, manager.receipt(id, data.token));
          return binary(manager.attachment(id, data.token));
        } finally { manager.close(); }
      }
      if (path === '/api/resume/docx') { await rateLimit(vault, 'docx', 20); return binary(await buildResumeDocx(data)); }
      if (TASK_ROUTES.has(path)) {
        if (path === '/api/mail/send' && (data.confirmed !== true || typeof data.token !== 'string' || !UUID.test(data.token))) throw new CloudError('请先确认收件人、正文和简历附件', 403);
        if ((path === '/api/ai' && data.task !== 'connection' || path === '/api/jobs/discover') && data.consent !== true) throw new CloudError('请先确认将本次材料发送至千问', 403);
        if (path === '/api/ai' && (typeof data.task !== 'string' || !data.payload || typeof data.payload !== 'object')) throw new CloudError('AI 请求缺少任务或内容');
        if (path === '/api/resume/extract' && data.uploadId) await ownedUpload(data.uploadId, session.visitor);
        return json(202, await queue(path, data, { owner: session.visitor }));
      }
      throw new CloudError('接口不存在', 404);
    } catch (error) { const detail = safeError(error); return json(detail.status, detail); }
  }
  async function worker(request) {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const { taskId } = await body(request, 2048);
    if (!same(request.headers.get('x-jobseeker-worker') || '', security.sign('worker', taskId))) return json(403, { error: 'Forbidden' });
    try { await processTask(taskId); } catch (error) { if (error.code !== 'BUSY') throw error; }
    return json(200, { ok: true });
  }
  async function schedule() {
    const scheduled = [];
    for (const key of await vault.keys('mail/')) {
      const id = key.slice(5), row = await vault.read(key);
      const active = row?.value.workspaces?.some(([, w]) => w.accounts?.length);
      if (!active) continue;
      const lock = (await vault.read('locks/mail-' + id))?.value;
      if (lock?.until > Date.now()) continue;
      try {
        await rateLimit(vault, 'scheduled-' + id, 1, 110000);
        scheduled.push(await queue('/api/mail/sync', { workspaceId: id }, { scheduled: true }));
      } catch (error) { if (error.status !== 429 && error.code !== 'BUSY') throw error; }
    }
    const day = new Date().toISOString().slice(0,10);
    const cleanup = await vault.write('maintenance/' + day, { createdAt: Date.now() }, { onlyIfNew: true });
    if (cleanup.modified) await fetchImpl(workerOrigin() + '/.netlify/functions/cleanup-background', { method: 'POST', headers: { 'X-Jobseeker-Worker': security.sign('cleanup', day) }, signal: AbortSignal.timeout(5000), redirect: 'error' });
    return { scheduled: scheduled.length };
  }
  async function cleanup() {
    const now = Date.now(); let removed = 0;
    for (const prefix of ['tasks/', 'uploads/']) {
      for (const key of await vault.keys(prefix)) {
        const row = await vault.read(key), expiry = row?.value.expiresAt ?? row?.value.until;
        // Expired tasks cannot be restarted; retain results for one day before cleanup.
        if (Number.isFinite(expiry) && expiry < now - 86400000) { await vault.remove(key); removed++; }
      }
    }
    return { removed };
  }
  return { handle, worker, schedule, cleanup, processTask, queue, security, vault };
}
