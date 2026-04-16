[CmdletBinding()]
param(
  [switch]$InstallDeps,
  [switch]$SkipTrust,
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
  $repoRoot = (Get-Location).Path
}

$pythonBridgeDir = Join-Path $repoRoot "python_bridge"
$certHelper = Join-Path $repoRoot "tools\generate_local_https_cert.py"

function Test-IsWindows {
  if ($env:OS -eq "Windows_NT") {
    return $true
  }

  try {
    return [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
  } catch {
    return $false
  }
}

if (-not (Test-Path $certHelper)) {
  throw "Cannot find certificate helper: $certHelper"
}

if ($InstallDeps) {
  Write-Host "[Generals Helper] Installing Python bridge dependencies..."
  & python -m pip install -e $pythonBridgeDir
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Python bridge dependencies."
  }
}

$shouldTrust = -not $SkipTrust
if (-not (Test-IsWindows)) {
  $shouldTrust = $false
}

$args = @(
  $certHelper,
  "--host", $BindHost,
  "--port", $Port.ToString(),
  "--serve"
)

if ($shouldTrust) {
  $args += "--trust"
}

Write-Host "[Generals Helper] Starting HTTPS bridge..."
& python @args
exit $LASTEXITCODE

