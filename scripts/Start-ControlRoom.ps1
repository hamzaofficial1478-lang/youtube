param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
try {
    $programDirectory = Split-Path -Parent $PSScriptRoot
    $serverFile = Join-Path $programDirectory 'server.js'
    $localUrl = 'http://127.0.0.1:3456'
    $existing = $null
    try { $existing = Invoke-RestMethod -Uri ($localUrl + '/api/health') -TimeoutSec 2 } catch { }
    if ($existing) {
        if ($existing.app -ne 'youtube-control-room') { throw 'Port 3456 belongs to another application. Nothing was stopped.' }
        Write-Host ('Control Room is already running: ' + $localUrl)
        if (-not $NoBrowser) { Start-Process $localUrl }
        exit 0
    }
    # The installer's own Node (runtime\node, 0.66) comes first; a Node 24 on the PATH works as before.
    $runtimeDirectory = Join-Path $programDirectory 'runtime'
    $bundledNode = Join-Path $runtimeDirectory 'node\node.exe'
    $nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
    if (-not $nodePath) { throw 'Node.js 24 is required. Run "Install Control Room" in the program folder, or install Node 24, then reopen this launcher.' }
    if ($nodePath -eq $bundledNode) { $env:Path = (Split-Path -Parent $bundledNode) + ';' + $env:Path }
    # The installer's own FFmpeg, unless FFMPEG_PATH already names one.
    $bundledFfmpeg = Join-Path $runtimeDirectory 'ffmpeg\bin\ffmpeg.exe'
    if (-not $env:FFMPEG_PATH -and (Test-Path -LiteralPath $bundledFfmpeg)) { $env:FFMPEG_PATH = $bundledFfmpeg; $env:FFPROBE_PATH = Join-Path (Split-Path -Parent $bundledFfmpeg) 'ffprobe.exe' }
    $runtimeVersion = & $nodePath -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0) { throw 'The Node.js runtime did not start correctly.' }
    $runtimeMajor = $runtimeVersion.Split('.')[0]
    if ($runtimeMajor -ne '24') { throw ('Node.js 24 is required; this launcher found major version ' + $runtimeMajor + '.') }
    # The locked packages are installed on the first start of a fresh download, and again when an update changes package-lock.json.
    $installedLock = Join-Path $programDirectory 'node_modules\.package-lock.json'
    if (-not (Test-Path -LiteralPath $installedLock) -or (Get-Item -LiteralPath (Join-Path $programDirectory 'package-lock.json')).LastWriteTimeUtc -gt (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc) {
        $npmPath = Join-Path (Split-Path -Parent $nodePath) 'npm.cmd'
        if (-not (Test-Path -LiteralPath $npmPath)) { $npmPath = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source }
        if (-not $npmPath) { throw 'npm (installed with Node.js 24) was not found. Run "Install Control Room" again, then reopen this launcher.' }
        Write-Host 'Installing the program''s packages (first start or after an update)...'
        Push-Location -LiteralPath $programDirectory
        try { & $npmPath ci --ignore-scripts --no-audit --no-fund; $npmExit = $LASTEXITCODE } finally { Pop-Location }
        if ($npmExit -ne 0) { throw 'Installing the packages failed. Check the internet connection, then reopen this launcher.' }
    }
    $dataDirectory = Join-Path $programDirectory 'data'
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    $env:PORT = '3456'
    $appProcess = Start-Process -FilePath $nodePath -ArgumentList @('"' + $serverFile + '"') -WorkingDirectory $programDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDirectory 'server.log') -RedirectStandardError (Join-Path $dataDirectory 'server-error.log') -PassThru
    $launchedAt = $appProcess.StartTime.ToUniversalTime().ToString('o')
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $appProcess.Refresh()
        if ($appProcess.HasExited) { throw 'Control Room stopped during startup. Read data/server-error.log for the cause.' }
        try { $health = Invoke-RestMethod -Uri ($localUrl + '/api/health') -TimeoutSec 1; $ready = $health.app -eq 'youtube-control-room' } catch { }
        if ($ready) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw 'Control Room did not become ready. Check data/server-error.log before retrying.' }
    @{ pid = $appProcess.Id; startedAt = $launchedAt; server = $serverFile } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDirectory 'launcher-process.json') -Encoding UTF8
    Write-Host ('Control Room is ready: ' + $localUrl)
    if (-not $NoBrowser) { Start-Process $localUrl }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
