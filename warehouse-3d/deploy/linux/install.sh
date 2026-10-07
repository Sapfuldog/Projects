#!/usr/bin/env bash
# Установка «Склад 3D» службой systemd: запуск при старте сервера, порт на всех интерфейсах (0.0.0.0).
#   sudo ./deploy/linux/install.sh            # порт 8080
#   sudo ./deploy/linux/install.sh 80         # другой порт
# Нужен Node.js 18+ и собранное приложение (папка dist: npm run build или готовый пакет из npm run release).
# Повторный запуск обновляет приложение; данные (/var/lib/sklad-3d) и настройки (/etc/sklad-3d.env) сохраняются.
set -euo pipefail

PORT="${1:-}"
APP_DIR=/opt/sklad-3d
ENV_FILE=/etc/sklad-3d.env
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Запустите через sudo"; exit 1; }
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "Не найден Node.js. Установите Node.js 18+ (рекомендуется 22 LTS)."; exit 1; }
"$NODE_BIN" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' \
  || { echo "Нужен Node.js 18 или новее, сейчас $("$NODE_BIN" --version)"; exit 1; }
[ -f "$SRC/dist/index.html" ] || { echo "Нет сборки $SRC/dist. Выполните npm run build или возьмите пакет из npm run release."; exit 1; }

id sklad3d > /dev/null 2>&1 || useradd --system --home-dir /var/lib/sklad-3d --shell /usr/sbin/nologin sklad3d

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/dist" "$APP_DIR/server"
cp -r "$SRC/dist" "$APP_DIR/dist"
mkdir -p "$APP_DIR/server"
cp "$SRC/server/server.mjs" "$APP_DIR/server/"
cp "$SRC/package.json" "$APP_DIR/"
chown -R root:root "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  sed -e "s#^PORT=.*#PORT=${PORT:-8080}#" -e "s#^\#DATA_DIR=.*#DATA_DIR=/var/lib/sklad-3d#" \
    "$SRC/sklad-3d.env.example" > "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  chown root:sklad3d "$ENV_FILE"
elif [ -n "$PORT" ]; then
  sed -i "s#^PORT=.*#PORT=$PORT#" "$ENV_FILE"
fi
PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -1)"
PORT="${PORT:-8080}"

sed "s#/usr/bin/node#$NODE_BIN#" "$SRC/deploy/linux/sklad-3d.service" > /etc/systemd/system/sklad-3d.service
if [ "$PORT" -lt 1024 ]; then
  # Порты ниже 1024 — только с правом CAP_NET_BIND_SERVICE
  sed -i 's#^NoNewPrivileges=true#AmbientCapabilities=CAP_NET_BIND_SERVICE\nNoNewPrivileges=true#' \
    /etc/systemd/system/sklad-3d.service
fi
systemctl daemon-reload
systemctl enable sklad-3d > /dev/null
systemctl restart sklad-3d

# Брандмауэр: открыть порт, если он включён
if command -v ufw > /dev/null && ufw status 2> /dev/null | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" > /dev/null && echo "ufw: открыт порт $PORT/tcp"
fi
if command -v firewall-cmd > /dev/null && firewall-cmd --state > /dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp" > /dev/null && firewall-cmd --reload > /dev/null \
    && echo "firewalld: открыт порт $PORT/tcp"
fi

sleep 1
if systemctl is-active --quiet sklad-3d; then
  echo "Склад 3D запущен. Адреса для сотрудников:"
  for ip in $(hostname -I 2> /dev/null); do
    case "$ip" in *:*) ;; *) echo "  http://$ip:$PORT" ;; esac
  done
  echo "Настройки: $ENV_FILE · данные: /var/lib/sklad-3d · журнал: journalctl -u sklad-3d -f"
else
  echo "Служба не запустилась. Журнал: journalctl -u sklad-3d -n 50"
  exit 1
fi
