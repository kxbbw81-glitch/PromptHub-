[CmdletBinding()]
param(
  [switch]$Run,
  [string]$OutputPath
)

$projectPath = Split-Path -Parent $PSScriptRoot
$ErrorActionPreference = 'Stop'
$OutputPath = if ($OutputPath) { $OutputPath } else { Join-Path $projectPath 'staging\grok-x-cli-output.json' }
$configPath = Join-Path $projectPath 'config\grok-x-discovery.json'
$importScript = Join-Path $PSScriptRoot 'grok-x-discovery.js'
$config = Get-Content -Raw -Encoding UTF8 $configPath | ConvertFrom-Json

if (-not $Run) {
  & node $importScript --config $configPath
  Write-Output ''
  Write-Output 'Candidate collection is not running. Re-run with -Run to ask Grok for public X candidates only.'
  exit 0
}

if (-not $config.enabled) {
  throw 'Grok X public discovery is disabled in config/grok-x-discovery.json.'
}
if (-not (Get-Command grok -ErrorAction SilentlyContinue)) {
  throw 'Grok CLI is not installed or not on PATH.'
}

$prompt = & node $importScript --config $configPath
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$promptPath = Join-Path $outputDirectory 'grok-x-discovery-prompt.txt'
Set-Content -Encoding UTF8 $promptPath $prompt

# No browser automation, cookies, X API calls, Git writes, or extension changes occur here.
& grok --prompt-file $promptPath --output-format json --max-turns $config.maxTurns | Set-Content -Encoding UTF8 $OutputPath
if ($LASTEXITCODE -ne 0) {
  throw "Grok CLI exited with code $LASTEXITCODE."
}
if (-not (Test-Path $OutputPath)) {
  throw 'Grok CLI did not create a candidate output file.'
}
& node $importScript --config $configPath --input $OutputPath
if ($LASTEXITCODE -ne 0) {
  throw "Candidate validation exited with code $LASTEXITCODE."
}

Write-Output "CANDIDATE_FILE=$OutputPath"
Write-Output 'No collection data was changed. Codex must validate, test, and confirm GitHub main before applying accepted candidates.'
