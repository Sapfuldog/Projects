# Установка «Склад 3D» на Windows: запуск при старте компьютера (задача планировщика от имени SYSTEM)
# и правило брандмауэра для входящих подключений. Приложение слушает все интерфейсы (0.0.0.0).
#
# Запуск в PowerShell от имени администратора из папки приложения:
#   powershell -ExecutionPolicy Bypass -File .\deploy\windows\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\deploy\windows\install.ps1 -Port 8080 -DataDir D:\Sklad3D
#
# Нужен Node.js 18+ (рекомендуется 22 LTS) и собранное приложение (папка dist: npm run build
# или готовый пакет из npm run release). Повторный запуск обновляет задачу; данные сохраняются.
param(
  [int]$Port = 8080,
  [string]$DataDir = "$env:ProgramData\Sklad3D",
  [string]$TaskName = 'Sklad3D'
)
$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Запустите PowerShell от имени администратора.'
}

$App = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) { throw 'Не найден Node.js. Установите Node.js 18+ (LTS) и откройте новое окно PowerShell.' }
$Node = $NodeCmd.Source
$major = [int]((& $Node --version).TrimStart('v').Split('.')[0])
if ($major -lt 18) { throw "Нужен Node.js 18 или новее, сейчас $(& $Node --version)." }
if (-not (Test-Path (Join-Path $App 'dist\index.html'))) {
  throw "Нет сборки $App\dist. Выполните npm run build или возьмите пакет из npm run release."
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# Настройки по умолчанию — в sklad-3d.env рядом с приложением (порт, пароль редактора, учётная система)
$EnvFile = Join-Path $App 'sklad-3d.env'
if (-not (Test-Path $EnvFile)) {
  $text = Get-Content -Raw -Encoding UTF8 (Join-Path $App 'sklad-3d.env.example')
  $text = $text -replace '(?m)^PORT=.*$', "PORT=$Port"
  [IO.File]::WriteAllText($EnvFile, $text, (New-Object Text.UTF8Encoding($false)))
}

$Server = Join-Path $App 'server\server.mjs'
$action = New-ScheduledTaskAction -Execute $Node `
  -Argument "`"$Server`" --host 0.0.0.0 --port $Port --data `"$DataDir`"" -WorkingDirectory $App
$trigger = New-ScheduledTaskTrigger -AtStartup
$runAs = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $runAs `
  -Settings $settings -Description 'Склад 3D: визуализация складов для сети компании' -Force | Out-Null

$rule = "Склад 3D (TCP $Port)"
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Action Allow -Profile Domain, Private | Out-Null
}

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 5
  Write-Host "Склад 3D запущен (версия модели $($h.model.version)). Адреса для сотрудников:"
} catch {
  Write-Warning "Сервер пока не отвечает на порту $Port. Проверьте: Get-ScheduledTask $TaskName; порт не занят другой программой."
}
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host "  http://$($_.IPAddress):$Port" }
Write-Host "Данные: $DataDir · настройки: $EnvFile"
