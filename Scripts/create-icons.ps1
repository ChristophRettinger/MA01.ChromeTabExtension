param(
    [Parameter(Mandatory)]
    [int]$Count,

    [Parameter(Mandatory)]
    [string]$BGColor,

    [Parameter(Mandatory)]
    [string]$FGColor,

    [Parameter(Mandatory)]
    [string]$Name = "Icon",

    [ValidateSet("Number", "Letter", "Custom")]
    [string]$Mode = "Number",

    [int]$StartNumber = 1,

    [ValidatePattern('^[A-Za-z]$')]
    [string]$StartLetter = "A",

    [string]$CustomSymbols
)

Add-Type -AssemblyName System.Drawing

function Darken-Color {
    param(
        [System.Drawing.Color]$Color,
        [int]$Amount = 30
    )

    return [System.Drawing.Color]::FromArgb(
        $Color.A,
        [Math]::Max(0, $Color.R - $Amount),
        [Math]::Max(0, $Color.G - $Amount),
        [Math]::Max(0, $Color.B - $Amount)
    )
}

function Get-Symbols {
    param(
        [string]$Mode,
        [int]$Count,
        [int]$StartNumber,
        [string]$StartLetter,
        [string]$CustomSymbols
    )

    if ($Mode -eq "Number") {
        return ($StartNumber..($StartNumber + $Count - 1))
    }

    if ($Mode -eq "Letter") {
        $startCode = [int][char]$StartLetter.ToUpperInvariant()
        if (($startCode + $Count - 1) -gt [int][char]'Z') {
            throw "Letter mode supports A-Z only."
        }

        $symbols = @()
        for ($offset = 0; $offset -lt $Count; $offset++) {
            $symbols += [char]($startCode + $offset)
        }

        return $symbols
    }

    if ([string]::IsNullOrWhiteSpace($CustomSymbols)) {
        throw "Custom mode requires -CustomSymbols (example: `"D,T,M,P`")."
    }

    $symbols = @(
        ($CustomSymbols -split '[,\s]+' | ForEach-Object { $_.Trim() }) |
            Where-Object { $_ -ne "" }
    )

    if ($symbols.Count -eq 0) {
        throw "Custom mode requires at least one symbol."
    }

    if ($Count -ne $symbols.Count) {
        throw "Count ($Count) must match the number of custom symbols ($($symbols.Count))."
    }

    foreach ($symbol in $symbols) {
        if ($symbol -notmatch '^[A-Za-z0-9]$') {
            throw "Custom symbols only support single letters or numbers. Invalid symbol: '$symbol'"
        }
    }

    return $symbols
}

$size       = 128
$radius     = 20
$padding    = 6
$fontName   = "Segoe UI"
$fontSize   = 90

$bgColorObj  = [System.Drawing.ColorTranslator]::FromHtml($BGColor)
$fgColorObj  = [System.Drawing.ColorTranslator]::FromHtml($FGColor)
$borderColor = Darken-Color $bgColorObj 30
$symbols     = Get-Symbols -Mode $Mode -Count $Count -StartNumber $StartNumber -StartLetter $StartLetter -CustomSymbols $CustomSymbols

foreach ($symbol in $symbols) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode = "AntiAlias"
    $gfx.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.RectangleF $padding, $padding, ($size - 2*$padding), ($size - 2*$padding)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2

    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $bgBrush = New-Object System.Drawing.SolidBrush $bgColorObj
    $gfx.FillPath($bgBrush, $path)

    $pen = New-Object System.Drawing.Pen $borderColor, 4
    $gfx.DrawPath($pen, $path)

    $font = New-Object System.Drawing.Font (
        $fontName,
        [float]$fontSize,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
    )
    $textBrush = New-Object System.Drawing.SolidBrush $fgColorObj

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = "Center"
    $sf.LineAlignment = "Center"

    $gfx.DrawString($symbol.ToString(), $font, $textBrush, ($size/2), ($size/2), $sf)

    $file = Join-Path $PSScriptRoot "$($Name)_$symbol.png"
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)

    $gfx.Dispose()
    $bmp.Dispose()
}
