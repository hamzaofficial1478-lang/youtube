# Brings this PC's Control Room up to the newest version on GitHub (0.66). Your data folder, keys and runtime stay
# as they are; a changed package list is installed at the next start.
$ErrorActionPreference = 'Stop'
try {
    $program = Split-Path -Parent $PSScriptRoot
    $git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
    if (-not $git) { foreach ($candidate in @((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))) { if (Test-Path -LiteralPath $candidate) { $git = $candidate } } }
    if (-not $git) { throw 'Git is not installed. Run "Install Control Room" first.' }
    if (-not (Test-Path -LiteralPath (Join-Path $program '.git'))) { throw 'This folder is not linked to GitHub yet. Run "Install Control Room" first.' }
    Push-Location -LiteralPath $program
    try {
        $changed = @(& $git status --porcelain --untracked-files=no)
        if ($changed.Count) { throw ('Program files were changed on this PC, so nothing was updated. Changed: ' + (($changed | ForEach-Object { $_.Substring(3) }) -join ', ')) }
        Write-Host 'Checking GitHub for a newer version ...'
        & $git fetch -q origin main
        if ($LASTEXITCODE -ne 0) { throw 'Could not reach GitHub. Check the internet connection and your GitHub sign-in.' }
        if ((& $git rev-parse HEAD) -eq (& $git rev-parse origin/main)) { Write-Host 'Already up to date.' -ForegroundColor Green; exit 0 }
        # The running program is stopped first, so it never serves half-updated pages.
        & (Join-Path $PSScriptRoot 'Stop-ControlRoom.ps1')
        & $git merge -q --ff-only origin/main
        if ($LASTEXITCODE -ne 0) { throw 'The update could not be applied cleanly; nothing was changed.' }
        $version = (Get-Content -LiteralPath (Join-Path $program 'package.json') -Raw | ConvertFrom-Json).version
        Write-Host ('Updated to version ' + $version + '.') -ForegroundColor Green
    } finally { Pop-Location }
    & (Join-Path $PSScriptRoot 'Start-ControlRoom.ps1')
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
