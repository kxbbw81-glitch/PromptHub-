param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ProjectPath,
  [switch]$SkipRemote
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath '.git'))) {
  throw "ProjectPath must point to a PromptHub Git repository: $ProjectPath"
}

Push-Location -LiteralPath $ProjectPath
try {
  node --test tests\*.test.js
  git diff --check
  git status --short

  if (-not $SkipRemote) {
    git ls-remote origin refs/heads/main
  }
} finally {
  Pop-Location
}
