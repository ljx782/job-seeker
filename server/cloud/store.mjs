import { randomUUID } from "node:crypto";
import { CloudError } from "./security.mjs";

export function encryptedStore(store, security) {
  return {
    async read(key) { const row = await store.getWithMetadata(key, { type: "json", consistency: "strong" }); return row ? { value: security.open(key, row.data), etag: row.etag } : null; },
    async write(key, value, condition = {}) { return store.setJSON(key, security.seal(key, value), condition); },
    async remove(key) { await store.delete(key); },
    async keys(prefix) { const result = []; for await (const page of store.list({ prefix, paginate: true })) result.push(...page.blobs.map(blob => blob.key)); return result; }
  };
}
export async function mutate(vault, key, callback, initial = null) {
  for (let i = 0; i < 8; i++) {
    const row = await vault.read(key), next = callback(row?.value ?? initial);
    const result = await vault.write(key, next, row ? { onlyIfMatch: row.etag } : { onlyIfNew: true });
    if (result.modified) return next;
  }
  throw new CloudError("云端记录正在更新，请稍后重试", 409);
}
export async function withLease(vault, name, callback, duration = 960000) {
  const key = "locks/" + name, owner = randomUUID(), now = Date.now();
  await mutate(vault, key, current => { if (current?.until > now) throw new CloudError("此工作区正在处理任务，请稍后重试", 409, "BUSY"); return { owner, until: now + duration }; });
  try { return await callback(); } finally {
    const row = await vault.read(key);
    if (row?.value.owner === owner) await vault.write(key, { owner, until: 0 }, { onlyIfMatch: row.etag });
  }
}
export async function rateLimit(vault, name, limit, period = 60000) {
  const now = Date.now();
  await mutate(vault, "limits/" + name, old => {
    const record = old?.until > now ? old : { count: 0, until: now + period };
    if (record.count >= limit) throw new CloudError("请求过于频繁，请稍后再试", 429);
    return { count: record.count + 1, until: record.until };
  });
}
