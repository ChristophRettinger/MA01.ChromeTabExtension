param(
    [string]$IconsPath = (Join-Path $PSScriptRoot '..' 'Extension' 'icons'),
    [string]$BackgroundJsPath = (Join-Path $PSScriptRoot '..' 'Extension' 'background.js')
)

if (-not (Test-Path -LiteralPath $IconsPath)) {
    throw "Icons folder not found: $IconsPath"
}

if (-not (Test-Path -LiteralPath $BackgroundJsPath)) {
    throw "background.js not found: $BackgroundJsPath"
}

$iconFiles = Get-ChildItem -LiteralPath $IconsPath -File -Filter '*.png' |
    Sort-Object -Property Name |
    Select-Object -ExpandProperty Name

if (-not $iconFiles -or $iconFiles.Count -eq 0) {
    throw "No icon files were found in: $IconsPath"
}

$iconsBlock = @("const AVAILABLE_ICONS = [")
$iconsBlock += $iconFiles | ForEach-Object { "  '$_'," }
$iconsBlock += "];"
$newIconsText = ($iconsBlock -join [Environment]::NewLine)

$backgroundJs = Get-Content -LiteralPath $BackgroundJsPath -Raw
$pattern = 'const AVAILABLE_ICONS = \[.*?\];'

if ($backgroundJs -notmatch 'const AVAILABLE_ICONS = \[') {
    throw "Could not find AVAILABLE_ICONS in $BackgroundJsPath"
}

$updatedBackgroundJs = [regex]::Replace($backgroundJs, $pattern, $newIconsText, [System.Text.RegularExpressions.RegexOptions]::Singleline)

if ($updatedBackgroundJs -eq $backgroundJs) {
    Write-Host 'AVAILABLE_ICONS is already up to date.'
    exit 0
}

[System.IO.File]::WriteAllText($BackgroundJsPath, $updatedBackgroundJs, [System.Text.UTF8Encoding]::new($false))
Write-Host "Updated AVAILABLE_ICONS in $BackgroundJsPath with $($iconFiles.Count) icons."
