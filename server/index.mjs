import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

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
  const { password_hash } = hashPassword(password, user.salt);
  return timingSafeEqual(Buffer.from(password_hash), Buffer.from(user.password_hash));
}

function publicUser(user) {
  return { id: user.id, username: user.username, createdAt: user.created_at };
}

async function qwenParse(prompt) {
  const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.QWEN_MODEL || 'qwen-plus';
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
    }),
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) return null;
  const data = await res.json();
  return { ...data, lifeflowModel: model };
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, {});
  try {
    if (req.url === '/api/auth/register' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username || !password || password.length < 6) return json(res, 400, { error: '用户名和至少 6 位密码必填' });
      const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (exists) return json(res, 409, { error: '这个用户名已经注册' });
      const id = randomBytes(12).toString('hex');
      const createdAt = new Date().toISOString();
      const { salt, password_hash } = hashPassword(password);
      db.prepare('INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)').run(id, username, password_hash, salt, createdAt);
      return json(res, 200, { user: { id, username, createdAt } });
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
      if (!data) return json(res, 503, { error: 'Qwen 未配置或暂时不可用' });
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
