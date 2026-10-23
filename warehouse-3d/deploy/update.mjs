#!/usr/bin/env node
// Кнопка «Обновить Склад 3D» (Windows: «Обновить Склад 3D.cmd» → deploy\windows\update.cmd):
// скачать последнюю версию ветки с GitHub, собрать и установить поверх этой папки, перезапустив сервер.
// Данные (DATA_DIR, по умолчанию папка data) и настройки (sklad-3d.env) не трогаются. Нужен доступ к GitHub и npm.
//   node deploy/update.mjs                   последняя версия (адрес архива — UPDATE_URL в sklad-3d.env)
//   node deploy/update.mjs --zip архив.zip   из архива ветки, скачанного вручную
//   node deploy/update.mjs --force           переустановить, даже если версия та же
// Готовый пакет собирается во временной папке и заменяет dist, server, deploy; папка с исходным кодом
// обновляется на месте и собирается в ней же.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, parseEnvFile } from '../server/server.mjs';
import { APP, appName, health, npm, readVersion, sleep, unzip } from './lib.mjs';

const DEFAULT_URL = 'https://github.com/Sapfuldog/Projects/archive/refs/heads/claude/warehouse-3d-map-mvm06a.zip';
/** Не трогать при обновлении: данные, настройки и зависимости. */
const KEEP = new Set(['data', 'sklad-3d.env', '.env', 'node_modules']);

const argv = process.argv.slice(2);
const zipArg = argv.includes('--zip') ? argv[argv.indexOf('--zip') + 1] : undefined;
const force = argv.includes('--force');
const cfg = loadConfig([]);

try {
  await update();
} catch (e) {
  console.error(`\nОбновление не выполнено: ${e.message}`);
  process.exit(1);
}

async function update() {
  const installed = readVersion();
  const source = fs.existsSync(path.join(APP, 'src'));
  console.log(`Склад 3D: обновление ${source ? 'папки с исходным кодом' : 'готового пакета'} ${APP}`);
  if (installed.commit) console.log(`Сейчас установлена версия ${installed.commit.slice(0, 7)}`);

  const buf = zipArg ? fs.readFileSync(path.resolve(zipArg)) : await download(updateUrl());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sklad-3d-update-'));
  try {
    const comment = unzip(buf, tmp).trim();
    const commit = /^[0-9a-f]{40}$/.test(comment) ? comment : '';
    if (commit && commit === installed.commit && !force) {
      console.log(`Уже установлена последняя версия (${commit.slice(0, 7)}).`);
      return;
    }
    const fresh = findApp(tmp);
    if (!fresh) throw new Error('в архиве нет приложения «Склад 3D»');
    const env = { SKLAD3D_COMMIT: commit };
    if (source) {
      await stopServer();
      replace(fresh, APP);
      npm(APP, ['install', '--no-audit', '--no-fund']);
      npm(APP, ['run', 'build']);
      fs.writeFileSync(path.join(APP, 'version.txt'), `\ufeffСклад 3D\r\nКоммит: ${commit || 'неизвестен'}\r\n`);
    } else {
      // Сборка, пока сервер ещё работает: он останавливается только на время замены файлов
      npm(fresh, ['ci', '--no-audit', '--no-fund']);
      npm(fresh, ['run', 'release'], env);
      const releaseDir = path.join(fresh, 'release');
      const pkg = fs.readdirSync(releaseDir).find((n) => fs.statSync(path.join(releaseDir, n)).isDirectory());
      if (!pkg) throw new Error('сборка не создала пакет');
      await stopServer();
      replace(path.join(releaseDir, pkg), APP);
    }
    console.log(
      `\nГотово: установлена версия ${commit ? commit.slice(0, 7) : 'из архива'}. Склады и настройки сохранены.`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function updateUrl() {
  let file = {};
  try {
    file = parseEnvFile(fs.readFileSync(cfg.envFile, 'utf8'));
  } catch {
    /* файла настроек нет */
  }
  return process.env.UPDATE_URL || file.UPDATE_URL || DEFAULT_URL;
}

async function download(url) {
  console.log(`Скачиваю ${url}`);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`сервер ответил ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(`Скачано ${(buf.length / 1048576).toFixed(1)} МБ`);
    return buf;
  } catch (e) {
    // Через настройки прокси Windows — так же, как скачивает браузер
    if (process.platform !== 'win32') throw new Error(`не удалось скачать: ${e.message}`);
    const file = path.join(os.tmpdir(), `sklad-3d-${process.pid}.zip`);
    const ps = [
      "$ProgressPreference = 'SilentlyContinue'",
      '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
      '$w = New-Object Net.WebClient',
      '$w.Proxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials',
      '$w.DownloadFile($env:SK_URL, $env:SK_FILE)',
    ].join('; ');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      env: { ...process.env, SK_URL: url, SK_FILE: file },
      stdio: 'inherit',
      windowsHide: true,
    });
    if (r.status !== 0 || !fs.existsSync(file))
      throw new Error(
        `не удалось скачать (${e.message}). Скачайте архив в браузере и запустите: update.cmd --zip <архив>`,
      );
    const buf = fs.readFileSync(file);
    fs.rmSync(file, { force: true });
    return buf;
  }
}

/** Папка приложения в распакованном архиве: package.json с тем же именем. */
function findApp(root, depth = 3) {
  try {
    if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name === appName) return root;
  } catch {
    /* не здесь */
  }
  if (depth === 0) return null;
  for (const e of fs.readdirSync(root, { withFileTypes: true }))
    if (e.isDirectory() && e.name !== 'node_modules') {
      const found = findApp(path.join(root, e.name), depth - 1);
      if (found) return found;
    }
  return null;
}

/** Остановить сервер «Склад 3D» на этом компьютере: по номеру процесса из /healthz или попросить закрыть окно. */
async function stopServer() {
  const local = ['0.0.0.0', '::'].includes(cfg.host);
  const host = local ? '127.0.0.1' : cfg.host;
  const h = await health(cfg.port, host);
  if (!h) return;
  console.log('Останавливаю запущенный Склад 3D…');
  try {
    if (h.pid) process.kill(h.pid);
  } catch (e) {
    if (e.code === 'EPERM')
      throw new Error(
        'Склад 3D работает как служба (задача Sklad3D). В PowerShell от имени администратора: ' +
          'Stop-ScheduledTask Sklad3D, затем «Обновить Склад 3D», затем Start-ScheduledTask Sklad3D',
      );
  }
  let asked = false;
  for (let i = 0; await health(cfg.port, host); i++) {
    if (i === 10 && !asked) {
      console.log('Закройте окно сервера «Склад 3D» — обновление продолжится само.');
      asked = true;
    }
    if (i > 600) throw new Error('сервер «Склад 3D» не остановился: закройте его окно и запустите обновление снова');
    await sleep(500);
  }
}

/** Заменить файлы приложения новыми: папки целиком, файлы поверх; KEEP не трогать. */
function replace(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (KEEP.has(e.name)) continue;
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) {
      fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(src, dst, { recursive: true });
    } else fs.copyFileSync(src, dst);
  }
}
