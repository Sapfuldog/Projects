// Готовый пакет для сервера без доступа к npm: собранное приложение, сервер, кнопки запуска и обновления
// для Windows, скрипты установки, Docker.
//   npm run release   → release/sklad-3d-<версия>/ и архивы release/sklad-3d-<версия>.zip и .tar.gz
// На сервере нужен только Node.js 18+ (или Docker с образом Node.js) — зависимостей нет.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zipDir } from '../deploy/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `sklad-3d-${pkg.version}`;
const releaseDir = path.join(root, 'release');
const out = path.join(releaseDir, name);

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('Нет сборки приложения: выполните npm run build');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const copy = (rel) =>
  fs.cpSync(path.join(root, rel), path.join(out, rel), {
    recursive: true,
    filter: (src) => !/\.test\.mjs$/.test(src),
  });
for (const rel of ['dist', 'server/server.mjs', 'deploy', 'sklad-3d.env.example', 'DEPLOY.md']) copy(rel);

// Кнопки в корне пакета: без call — cmd не вернётся в этот файл, даже если обновление его заменит
const crlf = (text) => text.replace(/\n/g, '\r\n');
fs.writeFileSync(path.join(out, 'Запустить Склад 3D.cmd'), crlf('@"%~dp0deploy\\windows\\start.cmd" %*\n'));
fs.writeFileSync(path.join(out, 'Обновить Склад 3D.cmd'), crlf('@"%~dp0deploy\\windows\\update.cmd" %*\n'));

// Какая версия собрана: «Обновить Склад 3D» сравнивает коммит с последним в ветке
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const commit = process.env.SKLAD3D_COMMIT || git('rev-parse', 'HEAD');
const branch = process.env.SKLAD3D_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD');
const built = new Date().toISOString().replace('T', ' ').slice(0, 16);
fs.writeFileSync(
  path.join(out, 'version.txt'),
  `\ufeff${crlf(
    `Склад 3D ${pkg.version}\nКоммит: ${commit || 'неизвестен'}\n${branch ? `Ветка: ${branch}\n` : ''}Собрано: ${built} UTC\n`,
  )}`,
);

fs.writeFileSync(
  path.join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      private: true,
      description: pkg.description,
      engines: pkg.engines,
      scripts: { start: 'node server/server.mjs' },
    },
    null,
    2,
  )}\n`,
);

// Docker из готового пакета: сборка и npm не нужны, только образ Node.js
fs.writeFileSync(
  path.join(out, 'Dockerfile'),
  `# «Склад 3D» из готового пакета: приложение уже собрано, нужен только образ Node.js.
#   docker compose up -d --build      → http://<адрес-сервера>:8080
ARG NODE_IMAGE=node:22-alpine
FROM \${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
COPY dist ./dist
COPY server/server.mjs ./server/server.mjs
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \\
  CMD wget -qO- "http://127.0.0.1:\${PORT}/healthz" > /dev/null || exit 1
CMD ["node", "server/server.mjs"]
`,
);
// Памятка для Windows: Блокнот, CRLF, UTF-8 с BOM
const START = `Склад 3D — готовый пакет (версия ${pkg.version}${commit ? `, ${commit.slice(0, 7)}` : ''})

1. Нужен Node.js 18 или новее (рекомендуется 22 LTS): https://nodejs.org или пакет программ компании.
   Подойдёт и распакованный архив node-v…-win-x64 в папке пользователя — кнопки найдут его сами.

2. Запуск — дважды щёлкните «Запустить Склад 3D».
   Откроется браузер со Складом 3D, а на рабочем столе появится ярлык «Склад 3D».
   Окно с текстом — это сервер: пока оно открыто, Склад 3D работает, в том числе у коллег по сети
   (http://<адрес этого компьютера>:8080). Закроете окно — Склад 3D остановится.
   Если брандмауэр Windows спросит про Node.js — разрешите для частных сетей, иначе коллеги не откроют.

3. Новая версия — дважды щёлкните «Обновить Склад 3D».
   Скачается и соберётся последняя версия (нужен интернет: GitHub и npm), сервер перезапустится.
   Склады (папка data) и настройки (sklad-3d.env) сохраняются.

4. Чтобы сервер работал всегда, даже без входа в Windows, — PowerShell от имени администратора в этой папке:
     powershell -ExecutionPolicy Bypass -File .\\deploy\\windows\\install.ps1

Если Windows не даёт запустить файлы из скачанного архива: «Свойства» архива → «Разблокировать»,
затем распакуйте заново.

Linux: sudo ./deploy/linux/install.sh      Docker: docker compose up -d --build
Подробно — DEPLOY.md.
`;
fs.writeFileSync(path.join(out, 'Как запустить.txt'), `\ufeff${START.replace(/\n/g, '\r\n')}`);

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8').replace(/^\s*NPM_REGISTRY:.*\n/m, '');
fs.writeFileSync(path.join(out, 'docker-compose.yml'), compose);

// zip — для Windows (открывается проводником), tar.gz — для Linux
fs.writeFileSync(path.join(releaseDir, `${name}.zip`), zipDir(out, name, commit));
try {
  execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: releaseDir, stdio: 'ignore' });
  console.log(`Готово: release/${name}/ и архивы release/${name}.zip, release/${name}.tar.gz`);
} catch {
  console.log(`Готово: release/${name}/ и архив release/${name}.zip (tar не найден)`);
}
