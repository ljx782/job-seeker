import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState, validateBackup } from '../js/storage.js';
import { callAI, clearAPIKey, initializeLocalServices } from '../js/api.js';

const jobs = JSON.parse(await readFile(new URL('../data/mock-jobs.json', import.meta.url), 'utf8'));

test('legacy demo backups migrate to the unified live AI setting', () => {
  const legacy = initialState(jobs);
  legacy.settings = { ...legacy.settings, mode: 'demo', provider: 'openai', model: 'legacy-model', endpoint: 'https://example.com/v1/responses' };
  const migrated = validateBackup(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migrated.settings.mode, 'live');
  assert.equal(migrated.settings.provider, 'openai');
  assert.equal(migrated.settings.model, 'legacy-model');
});

test('configured qwen handles demo and real payloads through the same AI request', async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === '/api/config') return new Response(JSON.stringify({ hosting: 'netlify', configured: true, provider: 'qwen-local', model: 'qwen-plus', csrfToken: 'csrf-test', capabilities: { unifiedAI: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url) === '/api/ai') return new Response(JSON.stringify({ result: { ok: true, source: JSON.parse(options.body).payload.source } }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`unexpected URL ${url}`);
  };
  try {
    await initializeLocalServices();
    const settings = { mode: 'demo', provider: 'qwen-local', model: 'qwen-plus', consent: true };
    const demo = await callAI(settings, 'match', { source: 'demo', jobId: 'demo-001' });
    const real = await callAI({ ...settings, mode: 'live' }, 'match', { source: 'user', jobId: 'real-001' });
    const aiRequests = requests.filter(request => request.url === '/api/ai');
    assert.equal(aiRequests.length, 2);
    assert.deepEqual([demo.source, real.source], ['demo', 'user']);
    assert.equal(aiRequests[0].options.headers['X-Jobseeker-Token'], 'csrf-test');
    assert.equal(aiRequests[0].options.headers['Content-Type'], 'application/json');
  } finally {
    globalThis.fetch = previous;
  }
});

test('unified AI still requires consent before sending personal payloads', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}', { status: 500 }); };
  try {
    await assert.rejects(callAI({ mode: 'demo', provider: 'qwen-local', model: 'qwen-plus', consent: false }, 'resume', { profile: { name: '示例' } }), /确认/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test('AI service errors are surfaced instead of replaced with demo data', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === '/api/ai') return new Response(JSON.stringify({ error: 'upstream unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
    throw new Error(`unexpected URL ${url}`);
  };
  try {
    await assert.rejects(callAI({ mode: 'demo', provider: 'qwen-local', model: 'qwen-plus', consent: true }, 'analysis', { applications: [] }), /upstream unavailable/);
  } finally {
    globalThis.fetch = previous;
    clearAPIKey();
  }
});
