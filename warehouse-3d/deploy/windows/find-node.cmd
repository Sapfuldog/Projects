@echo off
rem Ищет Node.js 18+ и записывает путь к node.exe в переменную NODE (для start.cmd и update.cmd).
rem Где ищет: PATH, папка node рядом с приложением, распакованный архив node-v...-win-x64 в папке
rem пользователя, в «Загрузках» или рядом с папкой приложения, обычная установка Node.js.
set "NODE="
for /f "delims=" %%N in ('where node 2^>nul') do call :try "%%N"
call :try "%~dp0..\..\node\node.exe"
for /d %%D in ("%USERPROFILE%\node-v*-win-x64" "%USERPROFILE%\Downloads\node-v*-win-x64" "%~dp0..\..\..\node-v*-win-x64") do call :try "%%~D\node.exe"
call :try "%ProgramFiles%\nodejs\node.exe"
call :try "%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined NODE exit /b 0
echo Не найден Node.js 18 или новее. Установите Node.js LTS с https://nodejs.org или распакуйте
echo архив node-v...-win-x64.zip в папку пользователя и запустите снова.
exit /b 1

:try
if defined NODE exit /b 0
if not exist "%~1" exit /b 0
"%~1" -e "process.exit(+process.versions.node.split('.')[0] < 18 ? 1 : 0)" 2> nul && set "NODE=%~1"
exit /b 0
