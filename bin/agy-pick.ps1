[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArguments
)

$jsScript = Join-Path $PSScriptRoot "agy-pick.js"
if (-not (Test-Path $jsScript)) {
    $jsScript = Join-Path $HOME ".gemini\antigravity-cli\tools\agy-pick.js"
}

if ($MyInvocation.InvocationName -eq '.') {
    function global:agy-pick {
        param(
            [Parameter(ValueFromRemainingArguments = $true)]
            [string[]]$Arguments
        )
        & node $jsScript @Arguments
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
    Write-Host "Exported 'agy-pick' function into PowerShell session." -ForegroundColor Cyan
} else {
    & node $jsScript @ScriptArguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
