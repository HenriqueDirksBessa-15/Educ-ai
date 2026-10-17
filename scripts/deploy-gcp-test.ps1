param(
  [string]$Project = "educai-511017",
  [string]$Region = "southamerica-east1",
  [string]$Service = "educai-test",
  [string]$Repository = "educai-test",
  [string]$Tag = (git rev-parse --short HEAD)
)

$ErrorActionPreference = "Stop"
$image = "$Region-docker.pkg.dev/$Project/$Repository/$Service`:$Tag"

gcloud builds submit --project $Project --region $Region --tag $image --quiet .
gcloud run jobs update "$Service-migrate" --project $Project --region $Region --image $image --quiet | Out-Null
gcloud run jobs execute "$Service-migrate" --project $Project --region $Region --wait --quiet
gcloud run jobs update "$Service-seed" --project $Project --region $Region --image $image --quiet | Out-Null
gcloud run services update $Service --project $Project --region $Region --image $image --quiet | Out-Null

$url = gcloud run services describe $Service --project $Project --region $Region --format="value(status.url)"
$live = Invoke-WebRequest -Uri "$url/api/health/live" -UseBasicParsing
$ready = Invoke-WebRequest -Uri "$url/api/health/ready" -UseBasicParsing
if ($live.StatusCode -ne 200 -or $ready.StatusCode -ne 200) { throw "Cloud Run smoke failed." }
Write-Output "EDUC.AI test updated: $url"
