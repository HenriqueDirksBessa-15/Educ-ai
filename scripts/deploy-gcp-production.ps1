param(
  [string]$Project = "educai-511017",
  [string]$Region = "southamerica-east1",
  [string]$Service = "educai",
  [string]$Repository = "educai-test",
  [string]$Tag = (git rev-parse --short HEAD),
  [string]$SmokeBaseUrl = "https://educai.dev.br",
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repositoryRoot

try {
  $status = git status --porcelain
  if ($status) {
    throw "O deploy exige uma árvore Git limpa para a imagem corresponder ao commit."
  }

  $migrationFiles = Get-ChildItem "database\migrations" -Filter "*.sql"
  foreach ($migration in $migrationFiles) {
    $content = [System.IO.File]::ReadAllText($migration.FullName)
    if ($content.Contains("`r`n")) {
      throw "Migração com CRLF invalida checksum: $($migration.Name)"
    }
  }

  $image = "$Region-docker.pkg.dev/$Project/$Repository/$Service`:$Tag"
  gcloud builds submit --project $Project --region $Region `
    --tag $image --quiet .
  if ($LASTEXITCODE -ne 0) { throw "Cloud Build falhou." }

  if (-not $SkipBackup) {
    gcloud sql backups create --instance educai-dev --project $Project `
      --description "pre-deploy-$Tag" --quiet
    if ($LASTEXITCODE -ne 0) { throw "Backup pré-deploy falhou." }
  }

  foreach ($job in @("educai-migrate", "educai-workers", "educai-retention")) {
    gcloud run jobs update $job --project $Project --region $Region `
      --image $image --quiet | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar o job $job." }
  }

  gcloud run jobs execute educai-migrate --project $Project --region $Region `
    --wait --quiet
  if ($LASTEXITCODE -ne 0) { throw "Migração de produção falhou." }

  gcloud run services update $Service --project $Project --region $Region `
    --image $image --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Atualização do Cloud Run falhou." }

  $live = Invoke-WebRequest -Uri "$SmokeBaseUrl/api/health/live" `
    -UseBasicParsing
  $ready = Invoke-WebRequest -Uri "$SmokeBaseUrl/api/health/ready" `
    -UseBasicParsing
  $root = Invoke-WebRequest -Uri "$SmokeBaseUrl/" -UseBasicParsing
  if (
    $live.StatusCode -ne 200 -or
    $ready.StatusCode -ne 200 -or
    $root.StatusCode -ne 200
  ) {
    throw "Smoke de produção falhou."
  }

  Write-Output "EDUC.AI publicado: $SmokeBaseUrl"
  Write-Output "Imagem: $image"
}
finally {
  Pop-Location
}
