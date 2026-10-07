# Удаление задачи «Склад 3D» и правила брандмауэра. Данные (по умолчанию %ProgramData%\Sklad3D) остаются.
#   powershell -ExecutionPolicy Bypass -File .\deploy\windows\uninstall.ps1
param([int]$Port = 8080, [string]$TaskName = 'Sklad3D')
$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName "Склад 3D (TCP $Port)" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host "Задача $TaskName удалена. Данные остались в $env:ProgramData\Sklad3D."
