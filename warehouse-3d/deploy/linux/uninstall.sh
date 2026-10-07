#!/usr/bin/env bash
# Удаление службы «Склад 3D». Данные (/var/lib/sklad-3d) и настройки (/etc/sklad-3d.env) остаются —
# удалите их вручную, если они больше не нужны.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Запустите через sudo"; exit 1; }
systemctl disable --now sklad-3d 2> /dev/null || true
rm -f /etc/systemd/system/sklad-3d.service
systemctl daemon-reload
rm -rf /opt/sklad-3d
echo "Служба удалена. Данные: /var/lib/sklad-3d, настройки: /etc/sklad-3d.env"
