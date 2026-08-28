$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web

$base    = 'https://nairamusic.com'
$user    = 'naira-admin'
$pass    = 'UzA2iDBcXblqnRFWKdNOtjLH'
$patch   = [System.IO.File]::ReadAllText("C:\Users\PACK&S~1\AppData\Local\Temp\claude\signal-os-clone\nmc_portal_patch.php", [System.Text.Encoding]::UTF8)
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.UserAgent = 'Mozilla/5.0'

Write-Host "1. Logging in..."
$login = Invoke-WebRequest -Uri "$base/wp-login.php" -Method POST `
    -Body @{log=$user; pwd=$pass; 'wp-submit'='Log In'; redirect_to='/wp-admin/'; testcookie='1'} `
    -WebSession $session -MaximumRedirection 5 -UseBasicParsing
Write-Host "   Status: $($login.StatusCode)"

Write-Host "2. Loading plugin editor..."
$edUrl = "$base/wp-admin/plugin-editor.php?file=nmc-core%2Fnmc-core.php&plugin=nmc-core%2Fnmc-core.php"
$ed = Invoke-WebRequest -Uri $edUrl -WebSession $session -UseBasicParsing
Write-Host "   Status: $($ed.StatusCode)"

# Extract nonce
$nonce = ''
if ($ed.Content -match '"nonce"\s*:\s*"([^"]+)"') { $nonce = $Matches[1]; Write-Host "   Nonce (JSON): $nonce" }
elseif ($ed.Content -match 'id="_wpnonce" value="([^"]+)"') { $nonce = $Matches[1]; Write-Host "   Nonce (input): $nonce" }
elseif ($ed.Content -match '"_ajax_nonce"\s*:\s*"([^"]+)"') { $nonce = $Matches[1]; Write-Host "   Nonce (ajax): $nonce" }
if (!$nonce) { Write-Host "ERROR: no nonce found"; Write-Host $ed.Content.Substring(0,2000); exit 1 }

# Extract textarea content
$current = ''
if ($ed.Content -match '(?s)<textarea[^>]+id="newcontent"[^>]*>(.*?)</textarea>') {
    $current = [System.Web.HttpUtility]::HtmlDecode($Matches[1])
    Write-Host "   Current file: $($current.Length) chars"
} else { Write-Host "ERROR: no textarea"; exit 1 }

if ($current.Contains('nmc_user_submit_track')) {
    Write-Host "ALREADY PATCHED - nothing to do."
    exit 0
}

Write-Host "3. Building patched content..."
$patched = $current.TrimEnd() + "`r`n`r`n" + $patch

Write-Host "4. Posting ($($patched.Length) chars)..."
$body = "action=edit-theme-plugin-file" +
        "&nonce=" + [System.Web.HttpUtility]::UrlEncode($nonce) +
        "&file=" + [System.Web.HttpUtility]::UrlEncode("nmc-core/nmc-core.php") +
        "&plugin=" + [System.Web.HttpUtility]::UrlEncode("nmc-core/nmc-core.php") +
        "&scrollTop=0" +
        "&newcontent=" + [System.Web.HttpUtility]::UrlEncode($patched)

$resp = Invoke-WebRequest -Uri "$base/wp-admin/admin-ajax.php" -Method POST `
    -Body $body `
    -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' `
    -WebSession $session -UseBasicParsing

Write-Host "   Response status: $($resp.StatusCode)"
$preview = $resp.Content.Substring(0, [Math]::Min(600, $resp.Content.Length))
Write-Host "   Body: $preview"

if ($resp.Content -like '*"success":true*') {
    Write-Host ""
    Write-Host "PATCH APPLIED SUCCESSFULLY"
} else {
    Write-Host ""
    Write-Host "Patch may have failed - check response above"
}
