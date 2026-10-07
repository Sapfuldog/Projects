# «Склад 3D» для сервера компании.
#   docker compose up -d --build      → http://<адрес-сервера>:8080
# Первый этап собирает приложение; в итоговом образе только Node.js, сервер и собранные файлы.
# Без интернета: укажите образ Node.js и зеркало npm из внутренней сети (NODE_IMAGE, NPM_REGISTRY).

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY
WORKDIR /app
COPY package.json package-lock.json ./
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
 && npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server/server.mjs ./server/server.mjs
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1
CMD ["node", "server/server.mjs"]
