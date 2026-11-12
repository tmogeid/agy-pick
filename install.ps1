<#
.SYNOPSIS
    Installs agy-pick (Antigravity CLI Interactive Conversation Picker) on Windows.

.DESCRIPTION
    Downloads or copies agy-pick into your Antigravity bin directory or user bin path.
    Can be run locally or remotely via:
    irm https://raw.githubusercontent.com/tmogeid/agy-pick/main/install.ps1 | iex
#>

$ErrorActionPreference = 'Stop'

Write-Host "Installing agy-pick..." -ForegroundColor Cyan

# 1. Verify Node.js is installed
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Warning "Node.js was not detected in PATH. agy-pick requires Node.js v16+ to run."
    Write-Warning "Please install Node.js from https://nodejs.org/"
}

# 2. Determine target install directory
$targetDir = ""
$standardAgyBin = Join-Path $env:LOCALAPPDATA "agy\bin"
$geminiBin = Join-Path $HOME ".gemini\antigravity-cli\bin"
$geminiTools = Join-Path $HOME ".gemini\antigravity-cli\tools"

if (Test-Path $standardAgyBin) {
    $targetDir = $standardAgyBin
} elseif (Test-Path $geminiBin) {
    $targetDir = $geminiBin
} else {
    $targetDir = Join-Path $HOME ".local\bin"
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
}

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$rawBaseUrl = "https://raw.githubusercontent.com/tmogeid/agy-pick/main"
$isLocal = Test-Path (Join-Path $PSScriptRoot "bin\agy-pick.js")

# 3. Install files
if ($isLocal) {
    Write-Host "Installing from local repository..." -ForegroundColor Gray
    Copy-Item (Join-Path $PSScriptRoot "bin\agy-pick.js") (Join-Path $targetDir "agy-pick.js") -Force
    Copy-Item (Join-Path $PSScriptRoot "bin\agy-pick.cmd") (Join-Path $targetDir "agy-pick.cmd") -Force
    Copy-Item (Join-Path $PSScriptRoot "bin\agy-pick.ps1") (Join-Path $targetDir "agy-pick.ps1") -Force
} else {
    Write-Host "Downloading latest release from GitHub..." -ForegroundColor Gray
    Invoke-RestMethod "$rawBaseUrl/bin/agy-pick.js" -OutFile (Join-Path $targetDir "agy-pick.js")
    Invoke-RestMethod "$rawBaseUrl/bin/agy-pick.cmd" -OutFile (Join-Path $targetDir "agy-pick.cmd")
    Invoke-RestMethod "$rawBaseUrl/bin/agy-pick.ps1" -OutFile (Join-Path $targetDir "agy-pick.ps1")
}

# Also ensure copy in ~/.gemini/antigravity-cli/tools if applicable
if (-not (Test-Path $geminiTools)) {
    New-Item -ItemType Directory -Path $geminiTools -Force | Out-Null
}
Copy-Item (Join-Path $targetDir "agy-pick.js") (Join-Path $geminiTools "agy-pick.js") -Force -ErrorAction SilentlyContinue

# 4. Check PATH
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$inPath = ($env:PATH -split ';') -contains $targetDir -or ($userPath -split ';') -contains $targetDir

if (-not $inPath) {
    Write-Host "Adding $targetDir to User PATH..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$targetDir", "User")
    $env:PATH = "$env:PATH;$targetDir"
}

Write-Host "`n✓ agy-pick installed successfully to: $targetDir" -ForegroundColor Green
Write-Host "You can now run:`n" -ForegroundColor White
Write-Host "  agy-pick           # Launch interactive menu with arrow keys" -ForegroundColor Cyan
Write-Host "  agy-pick --list    # List recent conversations" -ForegroundColor Cyan
Write-Host "  agy-pick --help    # View all options`n" -ForegroundColor Cyan
