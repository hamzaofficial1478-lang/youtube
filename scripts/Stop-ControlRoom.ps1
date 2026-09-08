$ErrorActionPreference = 'Stop'
try {
    $programDirectory = Split-Path -Parent $PSScriptRoot
    $recordPath = Join-Path $programDirectory 'data/launcher-process.json'
    if (-not (Test-Path -LiteralPath $recordPath)) { Write-Host 'No launcher-managed instance found. If started in a terminal, use Ctrl+C there.'; exit 0 }
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    $serverFile = Join-Path $programDirectory 'server.js'
    if ($record.server -ne $serverFile) { throw 'The saved process does not belong to this program folder. Nothing was stopped.' }
    $appProcess = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if (-not $appProcess) { Write-Host 'Control Room is already stopped.'; exit 0 }
    $processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$record.pid)
    if (-not $processInfo -or [string]::IsNullOrWhiteSpace($processInfo.CommandLine)) {
        throw 'Windows could not verify this process. Stop it from the Windows account or terminal that started it. Nothing was stopped.'
    }
    if ($appProcess.ProcessName -ne 'node' -or $appProcess.StartTime.ToUniversalTime().ToString('o') -ne $record.startedAt -or -not $processInfo.CommandLine.Contains('"' + $serverFile + '"')) {
        throw 'Process identity did not match the launcher record. Nothing was stopped.'
    }
    Stop-Process -Id $appProcess.Id
    Write-Host 'Control Room stopped. Your saved workspace remains in the data folder.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
