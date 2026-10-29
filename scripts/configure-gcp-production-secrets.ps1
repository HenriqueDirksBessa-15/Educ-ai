param(
  [string]$Project = "educai-nova-versao-20261026",
  [string]$Region = "southamerica-east1",
  [string]$Instance = "educai-db",
  [string]$RuntimeServiceAccount = "educai-runner",
  [string]$Bucket = "educai-nova-versao-20261026-materials",
  [string]$EnvironmentFile = (Join-Path $PSScriptRoot "..\.env")
)

$ErrorActionPreference = "Stop"
$resolvedEnvironment = (Resolve-Path -LiteralPath $EnvironmentFile).Path
$environment = @{}

foreach ($line in Get-Content -LiteralPath $resolvedEnvironment) {
  if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
  $value = $Matches[2].Trim()
  if (
    $value.Length -ge 2 -and
    (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $environment[$Matches[1]] = $value
}

$required = @(
  "DATABASE_URL",
  "TOKEN_ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_FORMS_TEST_FORM_ID",
  "OPENAI_API_KEY"
)
foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace($environment[$name])) {
    throw "Variável obrigatória ausente em ${resolvedEnvironment}: $name"
  }
}

$databaseUri = [System.UriBuilder]::new($environment["DATABASE_URL"])
$databaseUri.Host = "localhost"
$databaseUri.Port = -1
$socket = "/cloudsql/${Project}:${Region}:${Instance}"
$databaseUri.Query = "host=$([System.Uri]::EscapeDataString($socket))"

$secrets = [ordered]@{
  "educai-database-url"              = $databaseUri.Uri.AbsoluteUri
  "educai-token-key"                 = $environment["TOKEN_ENCRYPTION_KEY"]
  "educai-google-client-id"          = $environment["GOOGLE_CLIENT_ID"]
  "educai-google-client-secret"      = $environment["GOOGLE_CLIENT_SECRET"]
  "educai-google-forms-test-form-id" = $environment["GOOGLE_FORMS_TEST_FORM_ID"]
  "educai-openai-api-key"            = $environment["OPENAI_API_KEY"]
}

$runtimeEmail = "$RuntimeServiceAccount@$Project.iam.gserviceaccount.com"
$runtimeExists = gcloud iam service-accounts describe $runtimeEmail `
  --project $Project --format="value(email)" 2>$null
if (-not $runtimeExists) {
  gcloud iam service-accounts create $RuntimeServiceAccount `
    --project $Project `
    --display-name "EDUC.AI production Cloud Run" `
    --description "Least-privilege runtime identity for EDUC.AI production" `
    --quiet | Out-Null
}

gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$runtimeEmail" `
  --role roles/cloudsql.client --condition=None --quiet | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao conceder Cloud SQL Client." }
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" `
  --member "serviceAccount:$runtimeEmail" `
  --role roles/storage.objectUser --quiet | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao conceder Storage Object User." }

foreach ($entry in $secrets.GetEnumerator()) {
  $secret = $entry.Key
  $exists = gcloud secrets describe $secret --project $Project `
    --format="value(name)" 2>$null
  if (-not $exists) {
    gcloud secrets create $secret --project $Project `
      --replication-policy automatic `
      --labels "app=educai,environment=production" --quiet | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o segredo $secret." }
  }

  $tempPath = Join-Path $env:TEMP (
    "educai-secret-" + [guid]::NewGuid().ToString("N")
  )
  try {
    [System.IO.File]::WriteAllText(
      $tempPath,
      [string]$entry.Value,
      [System.Text.UTF8Encoding]::new($false)
    )
    gcloud secrets versions add $secret --project $Project `
      --data-file $tempPath --quiet | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao criar uma versão do segredo $secret."
    }
  }
  finally {
    if (Test-Path -LiteralPath $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force
    }
  }

  gcloud secrets add-iam-policy-binding $secret --project $Project `
    --member "serviceAccount:$runtimeEmail" `
    --role roles/secretmanager.secretAccessor --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao conceder acesso ao segredo $secret."
  }
  Write-Output "$secret`: versão criada e acesso concedido."
}

Write-Output "Segredos de produção configurados sem exibir valores."
