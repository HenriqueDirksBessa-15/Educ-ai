param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
$backupDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDirectory "educai-$timestamp.dump"

& pg_dump --format=custom --no-owner --no-privileges --file=$backupPath $DatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou com código $LASTEXITCODE" }

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
$manifestPath = "$backupPath.sha256"
Set-Content -LiteralPath $manifestPath -Value "$hash  $([System.IO.Path]::GetFileName($backupPath))"
Write-Output "Backup criado: $backupPath"
Write-Output "SHA-256: $hash"
