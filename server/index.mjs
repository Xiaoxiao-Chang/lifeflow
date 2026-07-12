import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = process.env.LIFEFLOW_DATA_DIR || join(__dirname, '..', 'data');
const distDir = join(rootDir, 'dist');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'lifeflow.sqlite'));
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(join(rootDir, '.env'));
loadEnvFile(join(rootDir, '.env.local'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_hash TEXT,
    salt TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sms_codes (
    phone TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
if (!userColumns.includes('phone')) {
  db.exec(`
    ALTER TABLE users RENAME TO users_legacy;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      password_hash TEXT,
      salt TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO users (id, phone, username, password_hash, salt, created_at)
      SELECT id, 'legacy_' || id, username, password_hash, salt, created_at FROM users_legacy;
    DROP TABLE users_legacy;
  `);
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(data));
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

async function serveStatic(req, res) {
  if (!existsSync(distDir)) return json(res, 404, { error: '前端还没有构建，请先运行 npm run build' });
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(distDir, normalized);
  if (!filePath.startsWith(distDir)) return json(res, 403, { error: 'Forbidden' });
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(distDir, 'index.html');
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const password_hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return { salt, password_hash };
}

function verifyPassword(password, user) {
  if (!user.password_hash || !user.salt) return false;
  const { password_hash } = hashPassword(password, user.salt);
  return timingSafeEqual(Buffer.from(password_hash), Buffer.from(user.password_hash));
}

function publicUser(user) {
  return { id: user.id, phone: user.phone, username: user.username, createdAt: user.created_at };
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('86') && digits.length === 13) return digits.slice(2);
  return digits;
}

function isChinaMobile(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function hashCode(phone, code) {
  return createHash('sha256').update(`${phone}:${code}:${process.env.SMS_CODE_PEPPER || 'lifeflow'}`).digest('hex');
}

function generateUsername() {
  return `LifeFlow_${Math.floor(1000 + Math.random() * 9000)}`;
}

function getSmsConfig() {
  return {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
    smsSdkAppId: process.env.TENCENT_SMS_APP_ID || '',
    signName: process.env.TENCENT_SMS_SIGN_NAME || '',
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID || '',
    region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
  };
}

function hmac(key, message, encoding) {
  return createHmac('sha256', key).update(message).digest(encoding);
}

async function sendTencentSms(phone, code) {
  const config = getSmsConfig();
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    return { sent: false, mock: true, reason: `短信配置缺失：${missing.join(', ')}` };
  }

  const hostName = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const action = 'SendSms';
  const version = '2021-01-11';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: config.smsSdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: [code, '5'],
  });
  const hashedPayload = createHash('sha256').update(payload).digest('hex');
  const canonicalRequest = ['POST', '/', '', 'content-type:application/json; charset=utf-8', `host:${hostName}`, '', 'content-type;host', hashedPayload].join('\n');
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonicalRequest].join('\n');
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmac(secretSigning, stringToSign, 'hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

  const res = await fetch(`https://${hostName}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: hostName,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': config.region,
    },
    body: payload,
  });
  const data = await res.json();
  if (!res.ok || data.Response?.Error) {
    const message = data.Response?.Error?.Message || `短信服务返回 ${res.status}`;
    throw new Error(message);
  }
  return { sent: true, mock: false };
}

async function qwenParse(prompt) {
  const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.QWEN_MODEL || 'qwen3.7-plus';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你只返回严格 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
      enable_thinking: false,
    }),
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const message = await res.text().catch(() => '');
    console.error(`Smart parse failed: ${res.status} ${message.slice(0, 300)}`);
    return null;
  }
  const data = await res.json();
  return { ...data, lifeflowModel: model };
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, {});
  try {
    if (req.url === '/api/ai/status' && req.method === 'GET') {
      return json(res, 200, {
        configured: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
        model: process.env.QWEN_MODEL || 'qwen3.7-plus',
      });
    }

    if (req.url === '/api/auth/sms/send' && req.method === 'POST') {
      const { phone: rawPhone } = await readBody(req);
      const phone = normalizePhone(rawPhone);
      if (!isChinaMobile(phone)) return json(res, 400, { error: '请输入有效的中国大陆手机号' });

      const now = Date.now();
      const existing = db.prepare('SELECT sent_at FROM sms_codes WHERE phone = ?').get(phone);
      if (existing && now - existing.sent_at < 60_000) return json(res, 429, { error: '验证码发送太频繁，请稍后再试' });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = now + 5 * 60_000;
      db.prepare(`
        INSERT INTO sms_codes (phone, code_hash, expires_at, sent_at, attempts)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(phone) DO UPDATE SET
          code_hash = excluded.code_hash,
          expires_at = excluded.expires_at,
          sent_at = excluded.sent_at,
          attempts = 0
      `).run(phone, hashCode(phone, code), expiresAt, now);

      const smsResult = await sendTencentSms(phone, code);
      return json(res, 200, {
        ok: true,
        mock: smsResult.mock,
        message: smsResult.mock ? '本地开发模式：短信配置未完整，已生成测试验证码' : '验证码已发送',
        devCode: smsResult.mock && process.env.NODE_ENV !== 'production' ? code : undefined,
      });
    }

    if (req.url === '/api/auth/sms/verify' && req.method === 'POST') {
      const { phone: rawPhone, code, username, mode = 'login' } = await readBody(req);
      const phone = normalizePhone(rawPhone);
      const inputCode = String(code || '').trim();
      if (!isChinaMobile(phone)) return json(res, 400, { error: '请输入有效的中国大陆手机号' });
      if (!/^\d{6}$/.test(inputCode)) return json(res, 400, { error: '请输入 6 位验证码' });

      const record = db.prepare('SELECT * FROM sms_codes WHERE phone = ?').get(phone);
      if (!record || Date.now() > record.expires_at) return json(res, 400, { error: '验证码已过期，请重新获取' });
      if (record.attempts >= 5) return json(res, 429, { error: '验证码错误次数过多，请重新获取' });
      if (record.code_hash !== hashCode(phone, inputCode)) {
        db.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone);
        return json(res, 400, { error: '验证码不正确' });
      }

      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (!user) {
        if (mode !== 'register') return json(res, 404, { error: '账号不存在，请先注册' });
        const id = randomBytes(12).toString('hex');
        const createdAt = new Date().toISOString();
        const displayName = String(username || '').trim() || generateUsername();
        db.prepare('INSERT INTO users (id, phone, username, created_at) VALUES (?, ?, ?, ?)').run(id, phone, displayName, createdAt);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      } else if (mode === 'register') {
        return json(res, 409, { error: '该手机号已注册，请直接登录' });
      } else if (username && String(username).trim()) {
        db.prepare('UPDATE users SET username = ? WHERE id = ?').run(String(username).trim(), user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
      db.prepare('DELETE FROM sms_codes WHERE phone = ?').run(phone);
      return json(res, 200, { user: publicUser(user) });
    }

    if (req.url === '/api/auth/password/login' && req.method === 'POST') {
      const { phone: rawPhone, password } = await readBody(req);
      const phone = normalizePhone(rawPhone);
      if (!isChinaMobile(phone)) return json(res, 400, { error: '请输入有效的中国大陆手机号' });
      const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (!user) return json(res, 404, { error: '账号不存在，请先注册' });
      if (!user.password_hash || !user.salt) return json(res, 403, { error: '您暂未设置密码，请通过其他方式登录' });
      if (!password || !verifyPassword(password, user)) return json(res, 401, { error: '手机号或密码不正确' });
      return json(res, 200, { user: publicUser(user) });
    }

    if (req.url === '/api/auth/profile' && req.method === 'POST') {
      const { id, username } = await readBody(req);
      const displayName = String(username || '').trim();
      if (!id || !displayName) return json(res, 400, { error: '用户名不能为空' });
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) return json(res, 404, { error: '账号不存在' });
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(displayName, id);
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return json(res, 200, { user: publicUser(updated) });
    }

    if (req.url === '/api/auth/password/set' && req.method === 'POST') {
      const { id, password } = await readBody(req);
      if (!id) return json(res, 400, { error: '账号信息缺失' });
      if (!password || String(password).length < 6) return json(res, 400, { error: '密码至少 6 位' });
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) return json(res, 404, { error: '账号不存在' });
      const { salt, password_hash } = hashPassword(String(password));
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(password_hash, salt, id);
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return json(res, 200, { user: publicUser(updated) });
    }

    if (req.url === '/api/auth/delete' && req.method === 'POST') {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: '账号信息缺失' });
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) return json(res, 404, { error: '账号不存在' });
      db.prepare('DELETE FROM sms_codes WHERE phone = ?').run(user.phone);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }

    if (req.url === '/api/auth/register' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username || !password || password.length < 6) return json(res, 400, { error: '用户名和至少 6 位密码必填' });
      const id = randomBytes(12).toString('hex');
      const createdAt = new Date().toISOString();
      const { salt, password_hash } = hashPassword(password);
      const phone = `legacy_${id}`;
      db.prepare('INSERT INTO users (id, phone, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, phone, username, password_hash, salt, createdAt);
      return json(res, 200, { user: { id, phone, username, createdAt } });
    }

    if (req.url === '/api/auth/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !verifyPassword(password, user)) return json(res, 401, { error: '用户名或密码不正确' });
      return json(res, 200, { user: publicUser(user) });
    }

    if (req.url === '/api/qwen/parse' && req.method === 'POST') {
      const { prompt } = await readBody(req);
      const data = await qwenParse(prompt);
      if (!data) return json(res, 503, { error: '智能解析暂时不可用' });
      return json(res, 200, data);
    }

    if (req.method === 'GET') return serveStatic(req, res);
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Server error' });
  }
}).listen(port, host, () => {
  console.log(`LifeFlow listening on http://${host}:${port}`);
});
