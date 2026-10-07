// Готовый пакет для сервера без доступа к npm: собранное приложение, сервер, скрипты установки, Docker.
//   npm run release   → release/sklad-3d-<версия>/ и архив release/sklad-3d-<версия>.tar.gz
// На сервере нужен только Node.js 18+ (или Docker с образом Node.js) — зависимостей нет.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const copy = (rel) => fs.cpSync(path.join(root, rel), path.join(out, rel), { recursive: true });
for (const rel of ['dist', 'server/server.mjs', 'deploy', 'sklad-3d.env.example', 'DEPLOY.md']) copy(rel);

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
const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8').replace(/^\s*NPM_REGISTRY:.*\n/m, '');
fs.writeFileSync(path.join(out, 'docker-compose.yml'), compose);

try {
  execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: releaseDir, stdio: 'ignore' });
  console.log(`Готово: release/${name}/ и архив release/${name}.tar.gz`);
} catch {
  console.log(`Готово: release/${name}/ (tar не найден — заархивируйте папку вручную)`);
}
