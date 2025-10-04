param(
    [string]$OutputDir = (Join-Path $PSScriptRoot '..\artifacts\windows'),
    [switch]$SkipFrontendBuild,
    [switch]$SkipBackendBuild
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

Write-Host "Building OrbitalOS Windows bundle..." -ForegroundColor Cyan

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$bundleDir = Join-Path $OutputDir 'OrbitalOS'
if (Test-Path $bundleDir) {
    Remove-Item -Recurse -Force $bundleDir
}
New-Item -ItemType Directory -Path $bundleDir | Out-Null

if (-not $SkipFrontendBuild) {
    Write-Host "Installing frontend dependencies and generating production build" -ForegroundColor Cyan
    Push-Location 'frontend'
    if (-not (Test-Path 'node_modules')) {
        npm install
    }
    npm run build
    Pop-Location
}

$frontendDist = Join-Path $repoRoot 'frontend\dist'
if (-not (Test-Path $frontendDist)) {
    throw "Frontend build output not found at $frontendDist. Run npm run build or pass -SkipFrontendBuild only if dist already exists."
}

Copy-Item -Path $frontendDist -Destination (Join-Path $bundleDir 'dist') -Recurse

if (-not $SkipBackendBuild) {
    Write-Host "Building backend in release mode" -ForegroundColor Cyan
    Push-Location 'backend'
    cargo build --release
    Pop-Location
}

$backendExe = Join-Path $repoRoot 'backend\target\release\orbitalos-backend.exe'
if (-not (Test-Path $backendExe)) {
    throw "Backend executable not found at $backendExe. Ensure cargo build --release succeeds."
}

Copy-Item -Path $backendExe -Destination (Join-Path $bundleDir 'orbitalos-backend.exe') -Force
Copy-Item -Path (Join-Path $repoRoot 'backend\env.example') -Destination (Join-Path $bundleDir '.env.example') -Force

Set-Content -Path (Join-Path $bundleDir 'README.txt') -Value @'
OrbitalOS Windows Bundle
========================

Contents:
- orbitalos-backend.exe : Backend API server that also serves the bundled frontend
- dist\                 : Production build of the React frontend
- .env.example          : Environment variable template

Usage:
1. Optional: Copy .env.example to .env and adjust PORT / HOST / JWT_SECRET / database settings.
2. From PowerShell, run:

   $env:PORT = "8082"        # adjust as needed
   $env:FRONTEND_DIST_DIR = "$PSScriptRoot\dist"
   .\orbitalos-backend.exe

3. Open http://localhost:8082 in your browser.

Notes:
- The backend executable will serve files from the dist folder sitting next to it.
- Ensure any required services (e.g., database) are reachable via the connection info in your environment variables.
'@

Write-Host "Bundle created at $bundleDir" -ForegroundColor Green
