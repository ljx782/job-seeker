import test from 'node:test';
import assert from 'node:assert/strict';
import { requestQwen } from '../server/ai.mjs';

const config = { key: 'TEST_KEY', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));

test('Qwen retries one transient network failure within the shared timeout', async () => {
  let calls = 0;
  const result = await requestQwen(config, 'connection', {}, {
    timeout: 5000,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw Object.assign(new TypeError('socket reset'), { cause: { code: 'ECONNRESET' } });
      return ok();
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.result, { ok: true });
});

test('Qwen does not retry HTTP failures or aborts', async () => {
  let httpCalls = 0;
  await assert.rejects(requestQwen(config, 'connection', {}, {
    fetchImpl: async () => { httpCalls++; return new Response('{}', { status: 503 }); },
  }), error => error.code === 'UPSTREAM_ERROR');
  assert.equal(httpCalls, 1);

  let abortCalls = 0;
  await assert.rejects(requestQwen(config, 'connection', {}, {
    fetchImpl: async () => { abortCalls++; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); },
  }), error => error.code === 'TIMEOUT');
  assert.equal(abortCalls, 1);
});

test('Qwen preserves NETWORK_ERROR after two transient failures', async () => {
  let calls = 0;
  await assert.rejects(requestQwen(config, 'connection', {}, {
    timeout: 5000,
    fetchImpl: async () => {
      calls++;
      throw Object.assign(new TypeError('temporary outage'), { cause: { code: 'EAI_AGAIN' } });
    },
  }), error => error.code === 'NETWORK_ERROR' && error.status === 502);
  assert.equal(calls, 2);
});

test('Qwen stops during retry delay on external abort and shared timeout', async () => {
  for (const external of [true, false]) {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(requestQwen(config, 'connection', {}, {
      signal: controller.signal,
      timeout: external ? 5000 : 20,
      fetchImpl: async () => {
        calls++;
        if (external) setTimeout(() => controller.abort(), 20);
        throw new TypeError('transient failure');
      },
    }), error => error.code === 'TIMEOUT' && error.message.includes(external ? '取消' : '超时'));
    assert.equal(calls, 1);
  }
});

test('Qwen does not retry malformed response content and logs no unsafe details', async t => {
  let calls = 0;
  await assert.rejects(requestQwen(config, 'connection', {}, {
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: 'not JSON' } }] })); },
  }), error => error.code === 'INVALID_JSON');
  assert.equal(calls, 1);
  const logs = [];
  t.mock.method(console, 'warn', (...args) => logs.push(args.join(' ')));
  await assert.rejects(requestQwen(config, 'connection', { message: 'PRIVATE_PAYLOAD' }, {
    fetchImpl: async () => { throw Object.assign(new TypeError('TEST_KEY PRIVATE_PAYLOAD'), { cause: { code: 'PRIVATE_CODE' } }); },
  }), error => error.code === 'NETWORK_ERROR');
  assert.equal(logs.length, 2);
  assert.ok(logs.every(line => line === '[qwen] network failure name=TypeError cause=unknown'));
});
