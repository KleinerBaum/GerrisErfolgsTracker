[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
}

$repositoryRootOutput = & git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) {
    throw "Run this script from inside the GerrisErfolgsTracker Git repository."
}

$repositoryRoot = [System.IO.Path]::GetFullPath(($repositoryRootOutput | Select-Object -First 1).Trim())
$commitShaOutput = & git -C $repositoryRoot rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0) {
    throw "The repository does not have a valid HEAD commit."
}
$commitSha = ($commitShaOutput | Select-Object -First 1).Trim()

$status = @(& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the Git working tree."
}
if ($status.Count -gt 0) {
    throw "Refusing to package an uncommitted source tree.`n$($status -join [Environment]::NewLine)"
}

$hostingMetadata = Join-Path $repositoryRoot ".openai\hosting.json"
if (-not (Test-Path -LiteralPath $hostingMetadata -PathType Leaf)) {
    throw "Missing Sites metadata: $hostingMetadata"
}

Push-Location $repositoryRoot
try {
    Invoke-CheckedCommand npm --prefix web run build
}
finally {
    Pop-Location
}

$standaloneRoot = Join-Path $repositoryRoot "web\dist\standalone"
$launcher = Join-Path $standaloneRoot "server.js"
$serverEntrypoint = Join-Path $standaloneRoot "dist\server\index.js"
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "Missing vinext standalone launcher: $launcher"
}
if (-not (Test-Path -LiteralPath $serverEntrypoint -PathType Leaf)) {
    throw "Missing vinext server entrypoint: $serverEntrypoint"
}

$requiredStandaloneEntries = @("package.json", "server.js", "dist", "node_modules")
foreach ($entry in $requiredStandaloneEntries) {
    $entryPath = Join-Path $standaloneRoot $entry
    if (-not (Test-Path -LiteralPath $entryPath)) {
        throw "Missing vinext standalone artifact: $entryPath"
    }
}

$headAfterBuildOutput = & git -C $repositoryRoot rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0) {
    throw "Unable to re-check HEAD after the build."
}
$headAfterBuild = ($headAfterBuildOutput | Select-Object -First 1).Trim()
if ($headAfterBuild -ne $commitSha) {
    throw "HEAD changed during the build; refusing to package mismatched source."
}

& git -C $repositoryRoot diff --quiet HEAD --
if ($LASTEXITCODE -ne 0) {
    throw "The build modified tracked source files; refusing to package them."
}

$sourceEpochOutput = & git -C $repositoryRoot show -s --format=%ct $commitSha
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the source commit timestamp."
}
$sourceEpoch = [long](($sourceEpochOutput | Select-Object -First 1).Trim())

$archiveDirectory = Join-Path $repositoryRoot "dist"
[System.IO.Directory]::CreateDirectory($archiveDirectory) | Out-Null
$archivePath = Join-Path $archiveDirectory "sites-vinext-${commitSha}.tar.gz"

$tarArguments = @(
    "-czf", $archivePath,
    "--format=pax",
    "--mtime=@$sourceEpoch",
    "--exclude=*.map"
)

$tarVersion = (& tar --version 2>&1 | Select-Object -First 1) -as [string]
if ($LASTEXITCODE -ne 0) {
    throw "The tar executable is required to package the Sites archive."
}
if ($tarVersion -match "GNU tar") {
    $tarArguments += @("--sort=name", "--owner=0", "--group=0", "--numeric-owner")
}

$tarArguments += @(
    "-C", $repositoryRoot, ".openai/hosting.json",
    "-C", $standaloneRoot, "package.json", "server.js", "dist", "node_modules"
)

Invoke-CheckedCommand tar @tarArguments
Write-Output $archivePath
