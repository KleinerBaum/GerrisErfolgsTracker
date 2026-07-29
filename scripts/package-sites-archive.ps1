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

$webRoot = Join-Path $repositoryRoot "web"
$hostingMetadata = Join-Path $webRoot ".openai\hosting.json"
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

$buildRoot = Join-Path $webRoot "dist"
$serverEntrypoint = Join-Path $buildRoot "server\index.js"
if (-not (Test-Path -LiteralPath $serverEntrypoint -PathType Leaf)) {
    throw "Missing vinext server entrypoint: $serverEntrypoint"
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

$archiveDirectory = Join-Path $repositoryRoot "dist"
[System.IO.Directory]::CreateDirectory($archiveDirectory) | Out-Null
$archivePath = Join-Path $archiveDirectory "sites-vinext-${commitSha}.tar.gz"
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("gerris-sites-" + [System.Guid]::NewGuid())
$stageDist = Join-Path $stageRoot "dist"

try {
    [System.IO.Directory]::CreateDirectory($stageDist) | Out-Null
    Copy-Item -Path (Join-Path $buildRoot "*") -Destination $stageDist -Recurse -Force

    $stageMetadata = Join-Path $stageDist ".openai"
    [System.IO.Directory]::CreateDirectory($stageMetadata) | Out-Null
    Copy-Item -LiteralPath $hostingMetadata -Destination (Join-Path $stageMetadata "hosting.json")

    $drizzleRoot = Join-Path $webRoot "drizzle"
    if (Test-Path -LiteralPath $drizzleRoot -PathType Container) {
        Copy-Item -LiteralPath $drizzleRoot -Destination (Join-Path $stageMetadata "drizzle") -Recurse
    }

    Invoke-CheckedCommand tar "-C" $stageRoot "-czf" $archivePath "dist"
    $archiveEntries = @(& tar -tzf $archivePath)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect the Sites archive."
    }
    foreach ($requiredEntry in @(
        "dist/server/index.js",
        "dist/.openai/hosting.json"
    )) {
        if ($archiveEntries -notcontains $requiredEntry) {
            throw "Missing Sites archive entry: $requiredEntry"
        }
    }
    if (Test-Path -LiteralPath $drizzleRoot -PathType Container) {
        foreach ($migration in Get-ChildItem -LiteralPath $drizzleRoot -Filter "*.sql" -File) {
            $migrationEntry = "dist/.openai/drizzle/$($migration.Name)"
            if ($archiveEntries -notcontains $migrationEntry) {
                throw "Missing Sites migration in archive: $migrationEntry"
            }
        }
    }
    Write-Output $archivePath
}
finally {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
}
