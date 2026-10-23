#!/usr/bin/env node
// Кнопка «Запустить Склад 3D» (Windows: «Запустить Склад 3D.cmd» → deploy\windows\start.cmd).
//   • Склад 3D уже работает на этом компьютере — открыть его в браузере, второй сервер не запускать;
//   • папка с исходным кодом без сборки — собрать (npm install, npm run build);
//   • Windows: при первом запуске положить на рабочий стол ярлык «Склад 3D»;
//   • запустить сервер (по умолчанию все сетевые интерфейсы, порт 8080) и открыть браузер.
// Окно, в котором идёт запуск, — это сервер: закроете его — Склад 3D остановится.
// Ключи передаются серверу: node deploy/launch.mjs --port 9000
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { loadConfig, openBrowser } from '../server/server.mjs';
import { APP, health, npm } from './lib.mjs';

const args = process.argv.slice(2);
const cfg = loadConfig(args);
const local = ['0.0.0.0', '::'].includes(cfg.host);
const url = `http://${local ? 'localhost' : cfg.host}:${cfg.port}/`;

if (await health(cfg.port, local ? '127.0.0.1' : cfg.host)) {
  console.log(`Склад 3D уже запущен — открываю ${url}`);
  openBrowser(url);
  process.exit(0);
}

if (!fs.existsSync(path.join(cfg.distDir, 'index.html'))) {
  if (!fs.existsSync(path.join(APP, 'src'))) {
    console.error('Нет собранного приложения (папка dist). Запустите «Обновить Склад 3D» или скачайте пакет заново.');
    process.exit(1);
  }
  console.log('Первый запуск: собираю приложение — пара минут, нужен доступ к npm…');
  try {
    if (!fs.existsSync(path.join(APP, 'node_modules'))) npm(APP, ['install', '--no-audit', '--no-fund']);
    npm(APP, ['run', 'build']);
  } catch (e) {
    console.error(`Сборка не удалась: ${e.message}`);
    process.exit(1);
  }
}

if (process.platform === 'win32') desktopShortcut();

// Ctrl+C получают оба процесса: сервер останавливается сам, а этот ждёт его и выходит с тем же кодом
process.on('SIGINT', () => {});
const server = spawn(process.execPath, [path.join(APP, 'server', 'server.mjs'), ...args, '--open'], {
  stdio: 'inherit',
});
server.on('exit', (code) => process.exit(code ?? 0));

/** Ярлык «Склад 3D» на рабочем столе: один раз; удалённый не возвращается, после переноса папки — исправляется. */
function desktopShortcut() {
  const mark = path.join(cfg.dataDir, '.desktop-shortcut');
  const ps = [
    "$l = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Склад 3D.lnk'",
    '$sh = New-Object -ComObject WScript.Shell',
    // ярлык есть и рабочий — не трогаем; удалили сами — не возвращаем; ведёт в старую папку — исправляем
    'if (Test-Path -LiteralPath $l) { if (Test-Path -LiteralPath $sh.CreateShortcut($l).TargetPath) { exit 0 } } ' +
      "elseif ($env:SK_MARK -eq '1') { exit 0 }",
    '$s = $sh.CreateShortcut($l)',
    '$s.TargetPath = $env:SK_TARGET',
    '$s.WorkingDirectory = $env:SK_DIR',
    "$s.IconLocation = $env:SK_ICON + ',0'",
    "$s.Description = 'Склад 3D: запустить и открыть в браузере'",
    '$s.Save()',
    "'created'",
  ].join('; ');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    env: {
      ...process.env,
      SK_TARGET: path.join(APP, 'deploy', 'windows', 'start.cmd'),
      SK_DIR: APP,
      SK_ICON: path.join(APP, 'deploy', 'windows', 'sklad-3d.ico'),
      SK_MARK: fs.existsSync(mark) ? '1' : '',
    },
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) return; // PowerShell недоступен — запускаем без ярлыка
  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    fs.writeFileSync(mark, '');
  } catch {
    /* отметка не записалась — ярлык просто проверят в следующий раз */
  }
  if (r.stdout.includes('created')) console.log('На рабочем столе появился ярлык «Склад 3D» — запуск одним щелчком.');
}
