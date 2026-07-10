param(
    [switch]$DryRun,
    [switch]$ConfigureCoordinator,
    [switch]$LiveTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\adaptive-router-for-codex'
$marketplaceName = 'adaptive-router-for-codex'
$selector = 'adaptive-router-for-codex@adaptive-router-for-codex'
$codexCli = Join-Path $pluginRoot 'node_modules\@openai\codex\bin\codex.js'

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

Invoke-Checked 'Run structural diagnostics' { & node (Join-Path $pluginRoot 'scripts\diagnose.mjs') }

if ($DryRun) {
    Write-Host "DRY RUN: would run npm ci --omit=dev in $pluginRoot"
    Write-Host "DRY RUN: would add or confirm marketplace $marketplaceName at $repoRoot"
    Write-Host "DRY RUN: would install and enable $selector"
    if ($ConfigureCoordinator) { Write-Host 'DRY RUN: would back up config.toml and set gpt-5.6-luna with low effort' }
    if ($LiveTest) { Write-Host 'DRY RUN: would run authenticated Luna, Terra, and Sol worker smoke tests' }
    Write-Host 'Dry run completed without changing dependencies, plugin state, or global config.'
    exit 0
}

Push-Location $pluginRoot
try {
    $npmCache = Join-Path $repoRoot '.npm-cache'
    Invoke-Checked 'Install exact runtime dependencies' { & $npmCommand.Source ci --omit=dev --cache $npmCache }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $codexCli)) { throw "Plugin-local Codex CLI was not installed at $codexCli" }

$marketplaceJson = & node $codexCli plugin marketplace list --json | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Could not list configured Codex marketplaces.' }
$marketplaces = ($marketplaceJson | ConvertFrom-Json).marketplaces
$matches = @($marketplaces | Where-Object { $_.name -eq $marketplaceName })
if ($matches.Count -gt 1) { throw "Multiple marketplaces named $marketplaceName are configured." }
if ($matches.Count -eq 1) {
    $existingRoot = [IO.Path]::GetFullPath([string]$matches[0].root).TrimEnd('\', '/')
    $expectedRoot = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\', '/')
    if (-not $existingRoot.Equals($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Marketplace $marketplaceName already points to '$existingRoot', not '$expectedRoot'. Refusing to overwrite the conflicting root."
    }
    Write-Host "==> Marketplace already points to this repository: $expectedRoot"
} else {
    Invoke-Checked "Add local marketplace $marketplaceName" { & node $codexCli plugin marketplace add $repoRoot --json }
}

Invoke-Checked "Install or refresh $selector" { & node $codexCli plugin add $selector --json }
Invoke-Checked 'Run strict structural diagnostics' { & node (Join-Path $pluginRoot 'scripts\diagnose.mjs') --strict }

$pluginsJson = & node $codexCli plugin list --available --json | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Could not verify installed Codex plugins.' }
$installed = ($pluginsJson | ConvertFrom-Json).installed | Where-Object { $_.pluginId -eq $selector }
if (-not $installed -or -not $installed.enabled) { throw "$selector is not installed and enabled." }

if ($ConfigureCoordinator) {
    $configPath = Join-Path $HOME '.codex\config.toml'
    Invoke-Checked 'Back up and configure the Luna coordinator' { & node (Join-Path $repoRoot 'scripts\configure-coordinator.mjs') $configPath }
}

if ($LiveTest) {
    Push-Location $pluginRoot
    try {
        Invoke-Checked 'Run authenticated live worker tests' { & $npmCommand.Source run test:live }
    } finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host 'Adaptive Router for Codex is installed and enabled.'
Write-Host 'Restart the Codex app or start a new task to load the plugin.'
Write-Host 'On the first trust prompt, run /hooks, inspect the Node hook command, and trust it once.'
