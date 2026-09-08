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
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js 24 is required. Install Node 24, then reopen this launcher.' }
    $runtimeVersion = & $nodeCommand.Source -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0) { throw 'The Node.js runtime did not start correctly.' }
    $runtimeMajor = $runtimeVersion.Split('.')[0]
    if ($runtimeMajor -ne '24') { throw ('Node.js 24 is required; this launcher found major version ' + $runtimeMajor + '.') }
    $dataDirectory = Join-Path $programDirectory 'data'
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    $env:PORT = '3456'
    $appProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $serverFile + '"') -WorkingDirectory $programDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDirectory 'server.log') -RedirectStandardError (Join-Path $dataDirectory 'server-error.log') -PassThru
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
