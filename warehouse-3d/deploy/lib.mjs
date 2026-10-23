// Общее для кнопок «Запустить Склад 3D» и «Обновить Склад 3D» и сборки пакета: только Node.js, без зависимостей.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Папка приложения: готовый пакет или папка с исходным кодом (warehouse-3d). */
export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const appName = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).name;
  } catch {
    return 'warehouse-3d';
  }
})();

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Запущенный на этом компьютере сервер «Склад 3D» (ответ /healthz) или null. */
export async function health(port, host = '127.0.0.1') {
  try {
    const r = await fetch(`http://${host}:${port}/healthz`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j?.ok && j.app === appName ? j : null;
  } catch {
    return null;
  }
}

/** npm той же установки Node.js, что запустила скрипт: без npm.ps1 и запрета сценариев PowerShell. */
export function npm(cwd, args, env = {}) {
  const dir = path.dirname(process.execPath);
  const cli = [
    path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find((p) => fs.existsSync(p));
  console.log(`> npm ${args.join(' ')}`);
  const opts = { cwd, stdio: 'inherit', env: { ...process.env, ...env } };
  const r = cli
    ? spawnSync(process.execPath, [cli, ...args], opts)
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { ...opts, shell: true });
  if (r.status !== 0) throw new Error(`не удалось выполнить npm ${args.join(' ')}`);
}

/** Сведения о сборке из version.txt (строка «Коммит: …»). */
export function readVersion(dir = APP) {
  try {
    const text = fs.readFileSync(path.join(dir, 'version.txt'), 'utf8');
    return { commit: /Коммит:\s*([0-9a-f]{40})/.exec(text)?.[1] ?? '', text };
  } catch {
    return { commit: '', text: '' };
  }
}

// ---------- zip: архив ветки с GitHub и готовый пакет для Windows ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Распаковать zip в папку; возвращает комментарий архива (у архивов GitHub — коммит).
 * Только обычные архивы (без ZIP64 и шифрования), пути за пределы папки отвергаются.
 */
export function unzip(buf, dest) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('это не zip-архив');
  const root = path.resolve(dest);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('архив повреждён');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`недопустимый путь в архиве: ${name}`);
    if (name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`неизвестный способ сжатия в архиве: ${method}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, method === 8 ? zlib.inflateRawSync(data) : data);
  }
  return buf.toString('utf8', end + 22, end + 22 + buf.readUInt16LE(end + 20));
}

/** Упаковать папку в zip (имена в UTF-8 — русские названия файлов читаются в проводнике Windows). */
export function zipDir(dir, prefix, comment = '') {
  const files = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else files.push(r);
    }
  };
  walk('');
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const rel of files.sort()) {
    const data = fs.readFileSync(path.join(dir, rel));
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const deflate = packed.length < data.length;
    const body = deflate ? packed : data;
    const name = Buffer.from(`${prefix}/${rel}`, 'utf8');
    const head = Buffer.alloc(26);
    head.writeUInt16LE(20, 0); // версия для распаковки
    head.writeUInt16LE(0x0800, 2); // имена в UTF-8
    head.writeUInt16LE(deflate ? 8 : 0, 4);
    head.writeUInt16LE(time, 6);
    head.writeUInt16LE(date, 8);
    head.writeUInt32LE(crc32(data), 10);
    head.writeUInt32LE(body.length, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt16LE(name.length, 22);
    const sig = (n) => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(n);
      return b;
    };
    chunks.push(sig(0x04034b50), head, name, body);
    const tail = Buffer.alloc(14);
    tail.writeUInt32LE(offset, 10); // смещение локального заголовка; комментарий, диск и атрибуты — нули
    central.push(sig(0x02014b50), Buffer.from([20, 0]), head, tail, name);
    offset += 4 + head.length + name.length + body.length;
  }
  const dirBuf = Buffer.concat(central);
  const note = Buffer.from(comment, 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(note.length, 20);
  return Buffer.concat([...chunks, dirBuf, end, note]);
}
