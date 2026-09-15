# Partani - Local Dev Server (PowerShell wrapper)
# Prefer double-clicking start-local.bat. This file just launches that script.

$ErrorActionPreference = "Continue"
try { $Host.UI.RawUI.WindowTitle = "Partani - Local Dev Server" } catch { }

Set-Location -LiteralPath $PSScriptRoot
& cmd.exe /c "`"$PSScriptRoot\start-local.bat`""
exit $LASTEXITCODE
