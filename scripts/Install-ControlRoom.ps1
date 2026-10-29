# One-click setup of the Control Room on a Windows 10/11 PC (0.66, owner request 2026-10-29: "make the program
# workable on other PCs"). It puts Node.js 24 and FFmpeg inside this program folder (runtime\), each checked against
# its published SHA-256, links the folder to GitHub so "Update Control Room" can bring new versions, installs the
# program's packages, makes a desktop shortcut and starts the program. Only Git is installed for the whole PC, through
# winget and only when it is missing. Every PC starts with its own empty workspace and its own keys.
param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest is many times faster without its progress bar; older Windows needs TLS 1.2 switched on.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$repository = 'https://github.com/hamzaofficial1478-lang/youtube.git'
# FFmpeg 9.0.2 "essentials" from gyan.dev (libass, libx264 and every filter the renders need). If gyan.dev no longer
# serves this exact package, its current release is taken with the checksum the site publishes for it.
$ffmpegPinned = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip'
$ffmpegPinnedSha256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
$ffmpegLatest = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$nodeFolder = 'https://nodejs.org/dist/latest-v24.x/'

function Write-Step([string]$text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }
function Write-Note([string]$text) { Write-Host $text -ForegroundColor Yellow }
# A text file from the internet (checksum lists), read as text whatever type the server gives it.
function Get-Text([string]$url) {
    $file = Join-Path $work ('text-' + [guid]::NewGuid().ToString('N'))
    Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing
    return [IO.File]::ReadAllText($file)
}
# Downloads a file and keeps it only when its SHA-256 matches.
function Get-Verified([string]$url, [string]$sha256, [string]$file) {
    Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $sha256.ToLowerInvariant()) {
        Remove-Item -LiteralPath $file -Force
        throw ('The download from ' + $url + ' did not match its published checksum, so it was not used. Try again later.')
    }
}
# Unpacks a zip holding one top folder and puts that folder at $destination.
function Expand-Into([string]$zip, [string]$destination) {
    $unpack = Join-Path $work ('unpack-' + [guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $zip -DestinationPath $unpack
    $inner = @(Get-ChildItem -LiteralPath $unpack -Directory)
    if ($inner.Count -ne 1) { throw ('The package ' + $zip + ' did not have the expected layout.') }
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
    Move-Item -LiteralPath $inner[0].FullName -Destination $destination
}
function Find-Git {
    $command = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

try {
    $program = Split-Path -Parent $PSScriptRoot
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'The Control Room needs 64-bit Windows 10 or 11.' }
    $runtime = Join-Path $program 'runtime'
    $work = Join-Path $runtime '.download'
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    Write-Host ('Setting up the Control Room in ' + $program)

    Write-Step '1/6 Unblocking the program files (Windows marks files from the internet)'
    Get-ChildItem -LiteralPath $program -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike '*\node_modules\*' -and $_.FullName -notlike '*\runtime\*' } | Unblock-File -ErrorAction SilentlyContinue

    Write-Step '2/6 Node.js 24, inside the program folder'
    $node = Join-Path $runtime 'node\node.exe'
    $nodeVersion = if (Test-Path -LiteralPath $node) { & $node -p 'process.versions.node' } else { '' }
    if ($nodeVersion -and $nodeVersion.Split('.')[0] -eq '24') { Write-Host ('Already installed: Node ' + $nodeVersion) }
    else {
        $listing = Get-Text ($nodeFolder + 'SHASUMS256.txt')
        $entry = ($listing -split "`n") | Where-Object { $_ -match '^[0-9a-f]{64}\s+node-v24\.\d+\.\d+-win-x64\.zip\s*$' } | Select-Object -First 1
        if (-not $entry) { throw 'nodejs.org did not list a Node.js 24 package for Windows. Try again later.' }
        $parts = $entry.Trim() -split '\s+'
        $zip = Join-Path $work $parts[1]
        Write-Host ('Downloading ' + $parts[1] + ' ...')
        Get-Verified ($nodeFolder + $parts[1]) $parts[0] $zip
        Expand-Into $zip (Join-Path $runtime 'node')
        Write-Host ('Installed Node ' + (& $node -p 'process.versions.node'))
    }
    $env:Path = (Join-Path $runtime 'node') + ';' + $env:Path

    Write-Step '3/6 FFmpeg (video and sound), inside the program folder'
    $ffmpeg = Join-Path $runtime 'ffmpeg\bin\ffmpeg.exe'
    if (Test-Path -LiteralPath $ffmpeg) { Write-Host 'Already installed.' }
    else {
        $url = $ffmpegPinned
        $sha256 = $ffmpegPinnedSha256
        $pinnedThere = $true
        try { Invoke-WebRequest -Uri $ffmpegPinned -Method Head -UseBasicParsing | Out-Null } catch { $pinnedThere = $false }
        if (-not $pinnedThere) {
            $url = $ffmpegLatest
            $sha256 = ((Get-Text ($ffmpegLatest + '.sha256')).Trim() -split '\s+')[0]
            Write-Note 'The tested FFmpeg 9.0.2 package is no longer offered; taking gyan.dev''s current release, checked against its published checksum.'
        }
        Write-Host 'Downloading FFmpeg (about 115 MB) ...'
        $zip = Join-Path $work 'ffmpeg.zip'
        Get-Verified $url $sha256 $zip
        Expand-Into $zip (Join-Path $runtime 'ffmpeg')
        Write-Host 'Installed FFmpeg. In the program, run the readiness check in Room 05 once and pin this build.'
    }

    Write-Step '4/6 Git, so "Update Control Room" can bring new versions'
    $git = Find-Git
    if (-not $git) {
        $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Host 'Installing Git with winget (Windows may ask for your permission) ...'
            & $winget.Source install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
            $git = Find-Git
        }
    }
    if (-not $git) { Write-Note 'Git could not be installed, so updates will not work yet. Install Git from https://git-scm.com, then run "Install Control Room" again.' }
    elseif (Test-Path -LiteralPath (Join-Path $program '.git')) { Write-Host 'This folder is already linked to GitHub.' }
    else {
        Write-Host 'Linking this folder to GitHub and taking the newest version (a GitHub sign-in may open if the repository is private) ...'
        Push-Location -LiteralPath $program
        try {
            & $git init -q -b main
            if ($LASTEXITCODE -ne 0) { throw 'git init failed.' }
            & $git remote add origin $repository
            & $git fetch origin main
            if ($LASTEXITCODE -ne 0) { throw 'Could not download from GitHub. Check the internet connection and your GitHub sign-in.' }
            & $git reset -q --hard origin/main
            if ($LASTEXITCODE -ne 0) { throw 'Could not take the newest version from GitHub.' }
            & $git branch -q --set-upstream-to=origin/main main
            Write-Host 'Linked to GitHub.'
        } catch {
            # A half-made link would stop the next run from trying again; the downloaded files still work.
            Remove-Item -LiteralPath (Join-Path $program '.git') -Recurse -Force -ErrorAction SilentlyContinue
            Write-Note ($_.Exception.Message + ' The program is set up from the downloaded files; run "Install Control Room" again later to link it for updates.')
        } finally { Pop-Location }
    }

    Write-Step '5/6 The program''s packages'
    Push-Location -LiteralPath $program
    try { & (Join-Path $runtime 'node\npm.cmd') ci --ignore-scripts --no-audit --no-fund; $npmExit = $LASTEXITCODE } finally { Pop-Location }
    if ($npmExit -ne 0) { throw 'Installing the packages failed. Check the internet connection, then run "Install Control Room" again.' }

    Write-Step '6/6 Desktop shortcut'
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Control Room.lnk'))
    $link.TargetPath = Join-Path $program 'Start Control Room.cmd'
    $link.WorkingDirectory = $program
    $link.Description = 'Start the YouTube Control Room'
    $link.Save()
    Write-Host 'Made "Control Room" on the desktop.'

    $browsers = @((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'), (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
    if (-not ($browsers | Where-Object { Test-Path -LiteralPath $_ })) { Write-Note 'Microsoft Edge or Google Chrome was not found. The program needs one of them to draw scenes.' }
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host 'The Control Room is installed. This PC has its own empty workspace: add your connections (Claude, ChatGPT, narrator, YouTube) in Connections.' -ForegroundColor Green
    if (-not $NoStart) { & (Join-Path $PSScriptRoot 'Start-ControlRoom.ps1') }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
