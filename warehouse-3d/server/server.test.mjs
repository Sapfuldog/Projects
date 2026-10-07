import { afterAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, loadConfig, ModelStore, parseEnvFile } from './server.mjs';

const roots = [];
const tmp = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
};
const servers = [];

async function start(over = {}) {
  const root = tmp('sklad-');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><title>Склад 3D</title>${'<p>'.repeat(800)}`);
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc.js'), 'console.log(1);'.repeat(200));
  const data = path.join(root, 'data');
  const cfg = {
    ...loadConfig([], { ENV_FILE: path.join(data, 'нет.env') }),
    host: '127.0.0.1',
    distDir: dist,
    dataDir: data,
    log: false,
    ...over,
  };
  const store = await new ModelStore(data, 3).load();
  const server = createApp(cfg, store);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return { base: `http://127.0.0.1:${server.address().port}`, data, dist, root };
}

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

const model = (name) => ({ warehouses: [{ id: 'w1', name }], tareTypes: [], consumers: [] });
const put = (base, body, headers = {}) =>
  fetch(`${base}/api/model`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('раздача приложения', () => {
  it('index.html без кэша, ассеты с долгим кэшем и сжатием, любой путь открывает приложение', async () => {
    const { base } = await start();
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(await index.text()).toContain('Склад 3D');

    const js = await fetch(`${base}/assets/index-abc.js`, { headers: { 'accept-encoding': 'gzip' } });
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(js.headers.get('content-encoding')).toBe('gzip');
    expect(await js.text()).toContain('console.log(1)');

    const deep = await fetch(`${base}/cells/А1-01`);
    expect(await deep.text()).toContain('Склад 3D');
    expect((await fetch(`${base}/assets/nope.js`)).status).toBe(404);
    expect((await fetch(`${base}/api/unknown`)).status).toBe(404);
  });

  it('не отдаёт файлы за пределами папки приложения', async () => {
    const { base, root } = await start();
    fs.writeFileSync(path.join(root, 'secret.txt'), 'секрет');
    for (const p of ['/..%2fsecret.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const r = await fetch(`${base}${p}`);
      expect(await r.text()).not.toContain('секрет');
    }
  });

  it('проверка работы: /healthz', async () => {
    const { base } = await start();
    const h = await (await fetch(`${base}/healthz`)).json();
    expect(h.ok).toBe(true);
    expect(h.model.version).toBe(0);
  });
});

describe('общая модель складов', () => {
  it('версии, конфликт при устаревшей версии, резервные копии', async () => {
    const { base, data } = await start();
    const empty = await (await fetch(`${base}/api/model`)).json();
    expect(empty).toMatchObject({ version: 0, model: null, protected: false });

    const r1 = await put(base, { baseVersion: 0, model: model('Склад 1') });
    expect(r1.status).toBe(200);
    expect((await r1.json()).version).toBe(1);

    const stale = await put(base, { baseVersion: 0, model: model('Чужая правка') });
    expect(stale.status).toBe(409);
    expect((await stale.json()).version).toBe(1);

    for (let v = 1; v <= 4; v++)
      expect((await put(base, { baseVersion: v, model: model(`Склад ${v + 1}`) })).status).toBe(200);
    const got = await (await fetch(`${base}/api/model`)).json();
    expect(got.version).toBe(5);
    expect(got.model.warehouses[0].name).toBe('Склад 5');
    expect((await (await fetch(`${base}/api/model/version`)).json()).version).toBe(5);

    // Хранится не больше трёх копий (BACKUPS в тесте), последняя — предыдущая версия
    const backups = fs.readdirSync(path.join(data, 'backups')).sort();
    expect(backups).toHaveLength(3);
    const last = JSON.parse(fs.readFileSync(path.join(data, 'backups', backups[2]), 'utf8'));
    expect(last.version).toBe(4);

    // После перезапуска сервер читает модель с диска
    const reloaded = await new ModelStore(data).load();
    expect(reloaded.meta.version).toBe(5);
  });

  it('неверный запрос не портит модель', async () => {
    const { base } = await start();
    expect((await put(base, { baseVersion: 0, model: { warehouses: 'нет' } })).status).toBe(400);
    const bad = await fetch(`${base}/api/model`, { method: 'PUT', body: '{не json' });
    expect(bad.status).toBe(400);
    expect((await (await fetch(`${base}/api/model`)).json()).version).toBe(0);
  });

  it('пароль редактора: без него только просмотр', async () => {
    const { base } = await start({ editPassword: 'склад-2026' });
    const meta = await (await fetch(`${base}/api/model`)).json();
    expect(meta.protected).toBe(true);
    expect((await put(base, { baseVersion: 0, model: model('A') })).status).toBe(401);
    expect(
      (await put(base, { baseVersion: 0, model: model('A') }, { 'x-edit-password': encodeURIComponent('неверно') }))
        .status,
    ).toBe(401);
    const ok = await put(
      base,
      { baseVersion: 0, model: model('A') },
      { 'x-edit-password': encodeURIComponent('склад-2026') },
    );
    expect(ok.status).toBe(200);
    const access = await fetch(`${base}/api/model/access`, {
      headers: { 'x-edit-password': encodeURIComponent('склад-2026') },
    });
    expect(await access.json()).toEqual({ protected: true, canEdit: true });
    expect(await (await fetch(`${base}/api/model/access`)).json()).toEqual({ protected: true, canEdit: false });
  });
});

describe('прокси к учётной системе', () => {
  it('передаёт путь, запрос и авторизацию, кэширует GET, пропускает POST', async () => {
    const seen = [];
    const erp = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ items: [{ address: 'А1-01-01-01', qty: seen.length }] }));
      });
    });
    await new Promise((r) => erp.listen(0, '127.0.0.1', r));
    servers.push(erp);
    const { base } = await start({
      erpUrl: `http://127.0.0.1:${erp.address().port}/base/hs`,
      erpHeaders: { authorization: 'Basic dGVzdDp0ZXN0' },
      erpCacheSec: 60,
    });
    const a = await (await fetch(`${base}/erp/stock?warehouse=1`)).json();
    const b = await (await fetch(`${base}/erp/stock?warehouse=1`)).json();
    expect(a).toEqual(b);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/base/hs/stock?warehouse=1', auth: 'Basic dGVzdDp0ZXN0' });

    const post = await fetch(`${base}/erp/locations`, { method: 'POST', body: '{"cells":[]}' });
    expect(post.status).toBe(200);
    expect(seen[1]).toMatchObject({ method: 'POST', url: '/base/hs/locations', body: '{"cells":[]}' });
  });

  it('понятная ошибка, если учётная система недоступна или прокси не настроен', async () => {
    const off = await start();
    expect((await fetch(`${off.base}/erp/stock`)).status).toBe(404);
    const { base } = await start({ erpUrl: 'http://127.0.0.1:1' });
    const r = await fetch(`${base}/erp/stock`);
    expect(r.status).toBe(502);
    expect((await r.json()).message).toContain('недоступна');
  });
});

describe('настройки сервера', () => {
  it('по умолчанию все интерфейсы 0.0.0.0:8080; ключи важнее переменных, переменные важнее файла', () => {
    const dir = tmp('sklad-env-');
    const file = path.join(dir, 'sklad-3d.env');
    fs.writeFileSync(file, '# настройки\nPORT=9000\nHOST=10.0.0.5\nEDIT_PASSWORD="пароль с пробелом"\nERP_USER=1c\n');
    const def = loadConfig([], { ENV_FILE: path.join(dir, 'нет.env') });
    expect([def.host, def.port]).toEqual(['0.0.0.0', 8080]);
    const fromFile = loadConfig([], { ENV_FILE: file });
    expect([fromFile.host, fromFile.port, fromFile.editPassword]).toEqual(['10.0.0.5', 9000, 'пароль с пробелом']);
    expect(fromFile.erpHeaders.authorization).toBe(`Basic ${Buffer.from('1c:').toString('base64')}`);
    const env = loadConfig([], { ENV_FILE: file, PORT: '8081' });
    expect(env.port).toBe(8081);
    const cli = loadConfig(['--port', '80', '--host=0.0.0.0', '--data', dir], { ENV_FILE: file, PORT: '8081' });
    expect([cli.host, cli.port, cli.dataDir]).toEqual(['0.0.0.0', 80, dir]);
    expect(() => loadConfig(['--port', 'восемь'], { ENV_FILE: file })).toThrow(/PORT/);
    expect(parseEnvFile('A=1\n  B = два \n#C=3\nbad line')).toEqual({ A: '1', B: 'два' });
  });
});
