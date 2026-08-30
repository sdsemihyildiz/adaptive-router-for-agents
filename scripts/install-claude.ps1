param(
    [switch]$DryRun,
    [switch]$LiveTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\adaptive-router-for-claude'
$marketplaceName = 'adaptive-router-for-claude'
$selector = 'adaptive-router-for-claude@adaptive-router-for-claude'

function Invoke-Checked {
    param([string]$Description, [scriptblock]$Command)
    Write-Host "==> $Description"
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
$nodeVersion = (& node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22) { throw "Node.js 22 or newer is required. Found $nodeVersion" }

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCommand) { throw 'npm is required.' }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'The claude CLI is required. Install Claude Code first: https://code.claude.com/docs/en/quickstart' }

Invoke-Checked 'Run structural diagnostics' { & node (Join-Path $pluginRoot 'scripts\diagnose.mjs') }

if ($DryRun) {
    Write-Host "DRY RUN: would run npm ci --omit=dev in $pluginRoot"
    Write-Host "DRY RUN: would add or confirm marketplace $marketplaceName at $repoRoot"
    Write-Host "DRY RUN: would install and enable $selector"
    if ($LiveTest) { Write-Host 'DRY RUN: would run authenticated Haiku, Sonnet, and Opus worker smoke tests' }
    Write-Host 'Dry run completed without changing dependencies or plugin state.'
    exit 0
}

Push-Location $pluginRoot
try {
    $npmCache = Join-Path $repoRoot '.npm-cache'
    Invoke-Checked 'Install exact runtime dependencies' { & $npmCommand.Source ci --omit=dev --cache $npmCache }
} finally {
    Pop-Location
}

$marketplaceJson = & claude plugin marketplace list --json | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Could not list configured Claude Code marketplaces.' }
$marketplaces = $marketplaceJson | ConvertFrom-Json
$matches = @($marketplaces | Where-Object { $_.name -eq $marketplaceName })
if ($matches.Count -gt 1) { throw "Multiple marketplaces named $marketplaceName are configured." }
if ($matches.Count -eq 1) {
    $existingLocation = if ($matches[0].installLocation) { $matches[0].installLocation } else { $matches[0].path }
    $existingRoot = [IO.Path]::GetFullPath([string]$existingLocation).TrimEnd('\', '/')
    $expectedRoot = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\', '/')
    if (-not $existingRoot.Equals($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Marketplace $marketplaceName already points to '$existingRoot', not '$expectedRoot'. Refusing to overwrite the conflicting root."
    }
    Write-Host "==> Marketplace already points to this repository: $expectedRoot"
} else {
    Invoke-Checked "Add local marketplace $marketplaceName" { & claude plugin marketplace add $repoRoot }
}

Invoke-Checked "Install or refresh $selector" { & claude plugin install $selector }
Invoke-Checked 'Run strict structural diagnostics' { & node (Join-Path $pluginRoot 'scripts\diagnose.mjs') --strict }

$pluginsJson = & claude plugin list --available --json | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Could not verify installed Claude Code plugins.' }
$entries = $pluginsJson | ConvertFrom-Json
$installed = $entries | Where-Object { "$($_.name)@$($_.marketplace)" -eq $selector -or $_.pluginId -eq $selector }
if (-not $installed) { throw "$selector was not found after install. Verify with: claude plugin list --json" }
if ($installed.enabled -eq $false) { throw "$selector is installed but not enabled. Run: claude plugin enable $selector" }

if ($LiveTest) {
    Push-Location $pluginRoot
    try {
        Invoke-Checked 'Run authenticated live worker tests' { & $npmCommand.Source run test:live }
    } finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host 'Adaptive Router for Claude Code is installed and enabled.'
Write-Host 'Restart Claude Code or start a new session to load the plugin.'
Write-Host 'On the first trust prompt, run /hooks, inspect the Node hook command, and trust it once.'
