@echo off
chcp 65001 > nul
title Склад 3D: обновление
rem Кнопка «Обновить Склад 3D»: скачать последнюю версию с GitHub, собрать и установить поверх. Склады
rem (папка data) и настройки (sklad-3d.env) остаются. Запущенный сервер останавливается и запускается снова.
rem   update.cmd --zip C:\путь\к\архиву.zip   из архива ветки, скачанного в браузере
cd /d "%~dp0..\.."
call "%~dp0find-node.cmd"
if errorlevel 1 (
  pause
  exit /b 1
)
rem Этот файл заменяется во время обновления: дальше — один блок, cmd прочитал его целиком заранее
(
  "%NODE%" deploy\update.mjs %*
  if errorlevel 1 (
    pause
    exit /b 1
  )
  call "%~dp0start.cmd"
  exit /b
)
