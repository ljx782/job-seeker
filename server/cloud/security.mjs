import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class CloudError extends Error {
  constructor(message, status = 400, code = "CLOUD_ERROR") { super(message); this.status = status; this.code = code; }
}
export const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export function cloudSecurity(env = process.env) {
  const secret = env.JOBSEEKER_SECRET || "";
  if (secret.length < 32) throw new CloudError("请在 Netlify 配置 JOBSEEKER_SECRET（至少 32 字符），然后重新部署。", 503, "SETUP_REQUIRED");
  const key = createHash("sha256").update("jobseeker:encryption:" + secret).digest();
  const sign = (purpose, value) => createHmac("sha256", secret).update(purpose + ":" + value).digest("base64url");
  const version = 'visitor-v1', lifetime = 180 * 86400;
  const cookieName = "jobseeker_session";
  const csrf = session => sign("csrf", session.nonce);
  const cookie = (value, age = lifetime) => `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
  return {
    sign, csrf, cookie,
    issue(previous) { const session = { visitor: previous?.visitor || randomBytes(24).toString("base64url"), nonce: previous?.nonce || randomBytes(24).toString("base64url"), exp: Date.now() + lifetime * 1000, version }; const data = Buffer.from(JSON.stringify(session)).toString("base64url"); return { session, cookie: cookie(data + "." + sign("session", data)) }; },
    authenticate(request) {
      const raw = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
      if (!raw || raw.length > 1500) return null;
      const [data, signature, extra] = raw.split(".");
      if (extra || !signature || !same(signature, sign("session", data))) return null;
      try { const s = JSON.parse(Buffer.from(data, "base64url")); return s.exp > Date.now() && s.version === version && /^[a-zA-Z0-9_-]{32}$/.test(s.visitor || '') && /^[a-zA-Z0-9_-]{32}$/.test(s.nonce || '') ? s : null; } catch { return null; }
    },
    seal(name, value) {
      const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from(name));
      const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), body: body.toString("base64") };
    },
    open(name, value) {
      if (!value || value.v !== 1) throw new CloudError("云端记录格式不正确", 500);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64")); decipher.setAAD(Buffer.from(name)); decipher.setAuthTag(Buffer.from(value.tag, "base64"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.body, "base64")), decipher.final()]).toString("utf8"));
    }
  };
}
export function enforceOrigin(request) {
  const origin = request.headers.get("origin"), expected = new URL(request.url).origin;
  if (origin && origin !== expected) throw new CloudError("不接受来自其他网站的请求", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new CloudError("不接受跨站请求", 403);
}
export function requireCsrf(request, session, security) {
  if (!same(request.headers.get("x-jobseeker-token") || "", security.csrf(session))) throw new CloudError("页面连接已过期，请刷新后重试", 403);
}
