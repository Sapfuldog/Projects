#!/usr/bin/env node
// Сервер «Склад 3D» для локальной сети компании. Нужен только Node.js 18+, зависимостей нет.
//
//   node server/server.mjs                         → http://0.0.0.0:8080 (все сетевые интерфейсы)
//   node server/server.mjs --port 80 --data /var/lib/sklad-3d
//
// Что делает:
//   • раздаёт собранное приложение (dist/) сотрудникам по адресу http://<адрес-машины>:<порт>;
//   • хранит общую модель складов — здания, стеллажи, ячейки, подключение к учётной системе, справочники тары
//     и кладовых, — чтобы все видели одно и то же: GET/PUT /api/model, версии и резервные копии в DATA_DIR;
//   • проксирует запросы к учётной системе: /erp/… → ERP_URL/… (без CORS; логин и пароль хранятся на сервере).
//
// Настройки (ключи командной строки важнее переменных окружения, переменные — важнее файла sklad-3d.env):
//   HOST=0.0.0.0            адрес, на котором слушать (0.0.0.0 — все интерфейсы)
//   PORT=8080               порт
//   DATA_DIR=./data         где хранить общую модель и резервные копии
//   EDIT_PASSWORD=          пароль на изменение складов (пусто — менять могут все)
//   ERP_URL=                адрес учётной системы для прокси /erp, напр. http://1c.zavod.local/base/hs/stock
//   ERP_USER= ERP_PASSWORD= логин и пароль учётной системы (Basic)
//   ERP_HEADERS=            дополнительные заголовки JSON, напр. {"Authorization":"Bearer …"}
//   ERP_CACHE_SEC=5         сколько секунд отдавать один и тот же ответ учётной системы всем пользователям
//   BACKUPS=30              сколько резервных копий модели хранить
//   LOG=1                   журнал запросов к API в консоль (0 — выключить)

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  HOST: '0.0.0.0',
  PORT: '8080',
  DIST_DIR: path.join(ROOT, 'dist'),
  DATA_DIR: path.join(ROOT, 'data'),
  EDIT_PASSWORD: '',
  ERP_URL: '',
  ERP_USER: '',
  ERP_PASSWORD: '',
  ERP_HEADERS: '',
  ERP_CACHE_SEC: '5',
  BACKUPS: '30',
  MAX_BODY_MB: '50',
  LOG: '1',
};

const ARGS = {
  '--host': 'HOST',
  '--port': 'PORT',
  '--data': 'DATA_DIR',
  '--dist': 'DIST_DIR',
  '--env': 'ENV_FILE',
  '--erp-url': 'ERP_URL',
  '--edit-password': 'EDIT_PASSWORD',
};

/** Строки KEY=VALUE файла настроек; # — комментарий, значение можно взять в кавычки. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function erpHeaders(c) {
  const h = {};
  if (c.ERP_USER) h.authorization = `Basic ${Buffer.from(`${c.ERP_USER}:${c.ERP_PASSWORD}`).toString('base64')}`;
  if (c.ERP_HEADERS) {
    try {
      Object.assign(h, JSON.parse(c.ERP_HEADERS));
    } catch {
      throw new Error('ERP_HEADERS: нужен JSON, например {"Authorization":"Bearer …"}');
    }
  }
  return h;
}

/** Настройки сервера: ключи командной строки → переменные окружения → файл sklad-3d.env → по умолчанию. */
export function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const cli = {};
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf('=');
    const flag = eq > 0 ? argv[i].slice(0, eq) : argv[i];
    if (!ARGS[flag]) continue;
    cli[ARGS[flag]] = eq > 0 ? argv[i].slice(eq + 1) : argv[++i];
  }
  const envFile = path.resolve(cli.ENV_FILE ?? env.ENV_FILE ?? path.join(ROOT, 'sklad-3d.env'));
  let file = {};
  try {
    file = parseEnvFile(fs.readFileSync(envFile, 'utf8'));
  } catch {
    /* файла настроек нет — берём переменные окружения и значения по умолчанию */
  }
  const c = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, cli[k] ?? env[k] ?? file[k] ?? DEFAULTS[k]]));
  const port = Number(c.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT: неверный порт «${c.PORT}»`);
  return {
    host: c.HOST,
    port,
    distDir: path.resolve(c.DIST_DIR),
    dataDir: path.resolve(c.DATA_DIR),
    editPassword: c.EDIT_PASSWORD,
    erpUrl: c.ERP_URL.replace(/\/+$/, ''),
    erpHeaders: erpHeaders(c),
    erpCacheSec: Number(c.ERP_CACHE_SEC) || 0,
    backups: Math.max(1, Number(c.BACKUPS) || 30),
    maxBody: (Number(c.MAX_BODY_MB) || 50) * 1024 * 1024,
    log: c.LOG !== '0',
    envFile,
  };
}

// ---------- Общая модель складов ----------

/** Общая модель в DATA_DIR/model.json: версия растёт на каждую запись, прежняя версия уходит в backups/. */
export class ModelStore {
  constructor(dir, keep = 30) {
    this.dir = dir;
    this.file = path.join(dir, 'model.json');
    this.backupDir = path.join(dir, 'backups');
    this.keep = keep;
    this.state = { version: 0, savedAt: null, model: null };
    this.queue = Promise.resolve();
  }

  async load() {
    await fsp.mkdir(this.backupDir, { recursive: true });
    try {
      const s = JSON.parse(await fsp.readFile(this.file, 'utf8'));
      if (typeof s.version !== 'number') throw new Error('нет номера версии');
      this.state = s;
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error(`Не удалось прочитать ${this.file}: ${e.message}`);
    }
    return this;
  }

  get meta() {
    return { version: this.state.version, savedAt: this.state.savedAt };
  }

  /** Записать модель, если её не успели изменить с версии baseVersion; записи идут строго по очереди. */
  save(model, baseVersion, savedBy) {
    const run = this.queue.then(async () => {
      if (baseVersion !== this.state.version) return { conflict: true, ...this.meta };
      const next = { version: this.state.version + 1, savedAt: new Date().toISOString(), savedBy, model };
      if (this.state.model) await this.backup();
      const tmp = `${this.file}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(next));
      await fsp.rename(tmp, this.file);
      this.state = next;
      return { conflict: false, ...this.meta };
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async backup() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(this.file, path.join(this.backupDir, `model-${stamp}-v${this.state.version}.json`));
    const files = (await fsp.readdir(this.backupDir)).filter((f) => f.startsWith('model-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - this.keep)))
      await fsp.unlink(path.join(this.backupDir, f)).catch(() => {});
  }
}

const isModel = (m) =>
  !!m &&
  typeof m === 'object' &&
  Array.isArray(m.warehouses) &&
  ['tareTypes', 'consumers'].every((k) => m[k] === undefined || Array.isArray(m[k]));

// ---------- Ответы ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};
const COMPRESSIBLE = /^(text\/|application\/(json|wasm)|image\/svg)/;

const BASE_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };

const acceptsGzip = (req) => /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');

function sendBody(req, res, status, body, type, extra = {}) {
  const headers = { ...BASE_HEADERS, 'content-type': type, vary: 'Accept-Encoding', ...extra };
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && acceptsGzip(req)) {
    buf = zlib.gzipSync(buf);
    headers['content-encoding'] = 'gzip';
  }
  headers['content-length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const sendJson = (req, res, status, data, extra = { 'cache-control': 'no-store' }) =>
  sendBody(req, res, status, JSON.stringify(data), 'application/json; charset=utf-8', extra);

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('слишком большой запрос'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Пароль редактора: заголовок X-Edit-Password (в кодировке URI, чтобы проходила кириллица). */
function canEdit(req, cfg) {
  if (!cfg.editPassword) return true;
  let given = '';
  try {
    given = decodeURIComponent(String(req.headers['x-edit-password'] ?? ''));
  } catch {
    return false;
  }
  const a = Buffer.from(given);
  const b = Buffer.from(cfg.editPassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clientOf = (req) => String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

// ---------- Раздача приложения ----------

async function statOf(file) {
  try {
    return await fsp.stat(file);
  } catch {
    return null;
  }
}

async function serveStatic(req, res, cfg, gzCache) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch {
    return sendBody(req, res, 400, 'Неверный адрес', 'text/plain; charset=utf-8');
  }
  let file = path.join(cfg.distDir, rel);
  if ((file !== cfg.distDir && !file.startsWith(cfg.distDir + path.sep)) || rel.includes('\0'))
    return sendBody(req, res, 404, 'Не найдено', 'text/plain; charset=utf-8');
  let st = await statOf(file);
  if (st?.isDirectory()) st = await statOf((file = path.join(file, 'index.html')));
  if (!st) {
    // Файлы с расширением — честный 404; остальные адреса открывают приложение
    if (path.extname(rel)) return sendBody(req, res, 404, 'Не найдено', 'text/plain; charset=utf-8');
    st = await statOf((file = path.join(cfg.distDir, 'index.html')));
    if (!st)
      return sendBody(
        req,
        res,
        503,
        `Нет сборки приложения в ${cfg.distDir}: выполните npm run build`,
        'text/plain; charset=utf-8',
      );
  }
  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  const headers = {
    etag,
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ...BASE_HEADERS, ...headers });
    return res.end();
  }
  if (COMPRESSIBLE.test(type) && acceptsGzip(req) && st.size > 1024) {
    const key = `${file}|${etag}`;
    let gz = gzCache.get(key);
    if (!gz) {
      gz = zlib.gzipSync(await fsp.readFile(file), { level: 9 });
      if (gzCache.size > 50) gzCache.clear();
      gzCache.set(key, gz);
    }
    res.writeHead(200, {
      ...BASE_HEADERS,
      ...headers,
      'content-type': type,
      'content-encoding': 'gzip',
      'content-length': gz.length,
      vary: 'Accept-Encoding',
    });
    return res.end(req.method === 'HEAD' ? undefined : gz);
  }
  res.writeHead(200, { ...BASE_HEADERS, ...headers, 'content-type': type, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

// ---------- Прокси к учётной системе ----------

async function proxyErp(req, res, cfg, cache) {
  if (!cfg.erpUrl)
    return sendJson(req, res, 404, {
      error: 'erp',
      message: 'Прокси к учётной системе не настроен: задайте ERP_URL в настройках сервера',
    });
  const u = new URL(req.url, 'http://local');
  const target = new URL(cfg.erpUrl + u.pathname.slice('/erp'.length) + u.search);
  const key = req.method === 'GET' ? target.href : '';
  const hit = key ? cache.get(key) : undefined;
  if (hit && hit.until > Date.now()) {
    res.cached = true;
    return sendBody(req, res, hit.status, hit.body, hit.type, { 'cache-control': 'no-store' });
  }
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req, cfg.maxBody);
  const headers = { accept: req.headers.accept ?? '*/*', ...cfg.erpHeaders };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (body) headers['content-length'] = body.length;
  await new Promise((resolve) => {
    const lib = target.protocol === 'https:' ? https : http;
    const up = lib.request(target, { method: req.method, headers, timeout: 30000 }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        const type = r.headers['content-type'] ?? 'application/octet-stream';
        const status = r.statusCode ?? 502;
        if (key && status === 200 && cfg.erpCacheSec > 0) {
          if (cache.size > 100) cache.clear();
          cache.set(key, { status, type, body: buf, until: Date.now() + cfg.erpCacheSec * 1000 });
        }
        sendBody(req, res, status, buf, type, { 'cache-control': 'no-store' });
        resolve();
      });
      r.on('error', (e) => {
        if (!res.headersSent) sendJson(req, res, 502, { error: 'erp', message: e.message });
        resolve();
      });
    });
    up.on('timeout', () => up.destroy(new Error('учётная система не ответила за 30 с')));
    up.on('error', (e) => {
      if (!res.headersSent)
        sendJson(req, res, 502, { error: 'erp', message: `Учётная система недоступна: ${e.message}` });
      resolve();
    });
    up.end(body);
  });
}

// ---------- Сервер ----------

export function createApp(cfg, store) {
  const gzCache = new Map();
  const erpCache = new Map();
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch {
    /* версия неизвестна */
  }

  async function api(req, res, pathname) {
    if (pathname === '/api/model') {
      if (req.method === 'GET' || req.method === 'HEAD')
        return sendJson(req, res, 200, { ...store.state, protected: !!cfg.editPassword });
      if (req.method !== 'PUT') return sendJson(req, res, 405, { error: 'method' });
      if (!canEdit(req, cfg)) return sendJson(req, res, 401, { error: 'password', message: 'Нужен пароль редактора' });
      let body;
      try {
        body = JSON.parse((await readBody(req, cfg.maxBody)).toString('utf8'));
      } catch (e) {
        return sendJson(req, res, e.status ?? 400, { error: 'body', message: e.message });
      }
      if (!Number.isInteger(body?.baseVersion) || !isModel(body?.model))
        return sendJson(req, res, 400, { error: 'body', message: 'Нужны baseVersion и model.warehouses' });
      const r = await store.save(body.model, body.baseVersion, clientOf(req));
      return r.conflict
        ? sendJson(req, res, 409, { error: 'conflict', version: r.version, savedAt: r.savedAt })
        : sendJson(req, res, 200, { version: r.version, savedAt: r.savedAt });
    }
    if (pathname === '/api/model/version') return sendJson(req, res, 200, store.meta);
    if (pathname === '/api/model/access')
      return sendJson(req, res, 200, { protected: !!cfg.editPassword, canEdit: canEdit(req, cfg) });
    return sendJson(req, res, 404, { error: 'not found' });
  }

  return http.createServer(async (req, res) => {
    const t0 = Date.now();
    let pathname = '/';
    try {
      pathname = new URL(req.url, 'http://local').pathname;
    } catch {
      /* разберёт serveStatic */
    }
    // В журнал — изменения модели, запросы к учётной системе и ошибки; фоновые опросы клиентов не пишутся
    if (cfg.log)
      res.on('finish', () => {
        const write = req.method !== 'GET' && req.method !== 'HEAD';
        const erp = pathname === '/erp' || pathname.startsWith('/erp/');
        if ((pathname.startsWith('/api/') && write) || (erp && !res.cached) || res.statusCode >= 400)
          console.log(
            `${new Date().toISOString()} ${clientOf(req)} ${req.method} ${pathname} ${res.statusCode} ${Date.now() - t0} мс`,
          );
      });
    try {
      if (pathname === '/healthz')
        return sendJson(req, res, 200, {
          ok: true,
          app: pkg.name,
          version: pkg.version,
          model: store.meta,
          uptime: Math.round(process.uptime()),
        });
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (pathname === '/erp' || pathname.startsWith('/erp/')) return await proxyErp(req, res, cfg, erpCache);
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'method' });
      return await serveStatic(req, res, cfg, gzCache);
    } catch (e) {
      console.error(`${req.method} ${pathname}:`, e);
      if (!res.headersSent) sendJson(req, res, e.status ?? 500, { error: 'server', message: e.message });
      else res.destroy();
    }
  });
}

/** Адреса, по которым сотрудники откроют приложение. */
export function lanUrls(host, port) {
  if (host !== '0.0.0.0' && host !== '::') return [`http://${host}:${port}`];
  const out = [`http://localhost:${port}`];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  return out;
}

async function main() {
  const cfg = loadConfig();
  const store = await new ModelStore(cfg.dataDir, cfg.backups).load();
  if (!fs.existsSync(path.join(cfg.distDir, 'index.html')))
    console.warn(`Внимание: нет ${path.join(cfg.distDir, 'index.html')} — выполните npm run build`);
  const server = createApp(cfg, store);
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`Порт ${cfg.port} занят другой программой: укажите другой (--port).`);
    else if (e.code === 'EACCES')
      console.error(`Нет прав открыть порт ${cfg.port}: порты ниже 1024 требуют прав администратора.`);
    else console.error(e.message);
    process.exit(1);
  });
  server.listen(cfg.port, cfg.host, () => {
    if (fs.existsSync('/.dockerenv'))
      console.log(
        `Склад 3D слушает ${cfg.host}:${cfg.port} в контейнере. Откройте http://<адрес сервера>:<порт из docker-compose.yml>`,
      );
    else {
      console.log(`Склад 3D слушает ${cfg.host}:${cfg.port}. Откройте в браузере:`);
      for (const url of lanUrls(cfg.host, cfg.port)) console.log(`  ${url}`);
    }
    console.log(
      `Данные: ${cfg.dataDir} (версия модели ${store.state.version})` +
        (cfg.editPassword ? ' · изменения по паролю редактора' : '') +
        (cfg.erpUrl ? ` · учётная система: ${cfg.erpUrl} → /erp` : ''),
    );
  });
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(`Склад 3D не запустился: ${e.message}`);
    process.exit(1);
  });
