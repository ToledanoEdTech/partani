# Partani - Setup Vercel Environment Variables
#
# Reads .env.local and uploads each variable to your Vercel project
# (Production, Preview, Development). Verifies the result at the end.
#
# Usage: Right-click -> "Run with PowerShell", or:  ./setup-vercel-env.ps1

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Partani - Vercel Env Setup"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Vercel Environment Variables Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot
$env:NODE_OPTIONS = "--use-system-ca"

# ---- Validate .env.local exists ----
if (-not (Test-Path ".env.local")) {
    Write-Host "[ERROR] .env.local not found in this folder." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ---- Parse .env.local ----
$envVars = [ordered]@{}
Get-Content ".env.local" | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $key = $Matches[1]
        $val = $Matches[2].Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"')) {
            $val = $val.Substring(1, $val.Length - 2)
        } elseif ($val.StartsWith("'") -and $val.EndsWith("'")) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        if ($val -ne "") { $envVars[$key] = $val }
    }
}

if ($envVars.Count -eq 0) {
    Write-Host "[ERROR] No valid variables found in .env.local" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[INFO] Found $($envVars.Count) variables in .env.local:" -ForegroundColor Green
foreach ($k in $envVars.Keys) {
    $masked = if ($envVars[$k].Length -gt 8) { $envVars[$k].Substring(0,4) + "..." + $envVars[$k].Substring($envVars[$k].Length - 4) } else { "***" }
    Write-Host "       $k = $masked" -ForegroundColor Gray
}
Write-Host ""

# ---- Link project to Vercel ----
Write-Host "[STEP 1/3] Linking project to Vercel..." -ForegroundColor Yellow
Write-Host "           If prompted, log in via the browser and return here." -ForegroundColor Yellow
Write-Host ""

& npx --yes vercel@latest link --yes
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Vercel link failed. Try running 'npx vercel login' manually first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Project linked to Vercel." -ForegroundColor Green
Write-Host ""

# ---- Upload each variable ----
Write-Host "[STEP 2/3] Uploading environment variables..." -ForegroundColor Yellow
Write-Host ""

$environments = @("production", "preview", "development")
$failures = @()
$idx = 0

foreach ($key in $envVars.Keys) {
    $idx++
    $val = $envVars[$key]
    Write-Host "  [$idx/$($envVars.Count)] $key" -ForegroundColor Cyan

    foreach ($envName in $environments) {
        # Remove first (so we can re-set cleanly). Errors ignored if not exists.
        & npx --yes vercel@latest env rm $key $envName --yes 2>&1 | Out-Null

        # Add fresh value via stdin
        $output = ($val | & npx --yes vercel@latest env add $key $envName 2>&1) | Out-String
        $rc = $LASTEXITCODE

        if ($rc -eq 0) {
            Write-Host "        $envName : OK" -ForegroundColor Green
        } else {
            Write-Host "        $envName : FAILED (exit=$rc)" -ForegroundColor Red
            Write-Host "          $($output.Trim())" -ForegroundColor DarkRed
            $failures += "$key/$envName"
        }
    }
}
Write-Host ""

# ---- Verify by listing what's now set on Vercel ----
Write-Host "[STEP 3/3] Verifying variables on Vercel..." -ForegroundColor Yellow
Write-Host ""
& npx --yes vercel@latest env ls production
Write-Host ""

# ---- Summary ----
Write-Host "============================================================" -ForegroundColor Cyan
if ($failures.Count -eq 0) {
    Write-Host "  All $($envVars.Count) variables uploaded successfully!" -ForegroundColor Green
} else {
    Write-Host "  WARNING: $($failures.Count) operation(s) failed:" -ForegroundColor Yellow
    $failures | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
}
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Next step: REDEPLOY in Vercel for variables to take effect:" -ForegroundColor White
Write-Host "    1. https://vercel.com/dashboard" -ForegroundColor White
Write-Host "    2. Open 'partani' project" -ForegroundColor White
Write-Host "    3. Deployments tab -> '...' on latest -> Redeploy" -ForegroundColor White
Write-Host "       (Make sure 'Use existing Build Cache' is UNCHECKED)" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit"
