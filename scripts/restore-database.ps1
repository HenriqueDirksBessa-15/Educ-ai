param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
  throw "Restauração altera o banco alvo. Execute novamente com -ConfirmRestore."
}
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
if ([System.IO.Path]::GetExtension($resolvedBackup) -ne ".dump") {
  throw "O arquivo deve usar a extensão .dump."
}

& pg_restore --clean --if-exists --no-owner --no-privileges --dbname=$DatabaseUrl $resolvedBackup
if ($LASTEXITCODE -ne 0) { throw "pg_restore falhou com código $LASTEXITCODE" }
Write-Output "Restauração concluída a partir de: $resolvedBackup"
