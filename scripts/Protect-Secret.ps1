param([ValidateSet('protect','unprotect')][string]$Operation)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    $inputBytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
    $entropy = [Text.Encoding]::UTF8.GetBytes('youtube-control-room:youtube-api-key:v1')
    if ($Operation -eq 'protect') {
        $result = [Security.Cryptography.ProtectedData]::Protect($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    } else {
        $result = [Security.Cryptography.ProtectedData]::Unprotect($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    }
    [Console]::Out.Write([Convert]::ToBase64String($result))
} catch {
    [Console]::Error.Write('Windows secret protection failed.')
    exit 1
}
