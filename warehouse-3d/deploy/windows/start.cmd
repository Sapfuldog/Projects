@echo off
chcp 65001 > nul
rem Запуск «Склад 3D» вручную (окно должно оставаться открытым). Для автозапуска — install.ps1.
rem Порт и другие настройки — в sklad-3d.env рядом с package.json или ключами: start.cmd --port 9000
cd /d "%~dp0..\.."
where node > nul 2> nul || (echo Не найден Node.js 18+. Установите его и запустите снова. & pause & exit /b 1)
if not exist dist\index.html (echo Нет сборки dist. Выполните npm run build. & pause & exit /b 1)
node server\server.mjs --host 0.0.0.0 %*
pause
