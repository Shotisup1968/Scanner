Add-Type -AssemblyName System.Drawing

function New-ScannerIcon {
    param(
        [int]$Size,
        [string]$OutPath,
        [bool]$Maskable = $false,
        [bool]$Opaque = $true
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $bgColor = [System.Drawing.Color]::FromArgb(255, 23, 32, 58)      # dark navy
    $accent  = [System.Drawing.Color]::FromArgb(255, 45, 212, 191)    # teal
    $white   = [System.Drawing.Color]::FromArgb(255, 246, 247, 250)
    $lineGrey= [System.Drawing.Color]::FromArgb(255, 176, 184, 200)

    $g.Clear($bgColor)

    # padding: maskable icons need generous safe-zone padding (~20% each side)
    $pad = if ($Maskable) { $Size * 0.24 } else { $Size * 0.15 }
    $inner = $Size - (2 * $pad)

    # Viewfinder corner brackets (skip for maskable to stay safely inside)
    if (-not $Maskable) {
        $bracketLen = $inner * 0.22
        $bracketPen = New-Object System.Drawing.Pen($accent, [Math]::Max(2, $Size * 0.035))
        $bracketPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $bracketPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $m = $pad * 0.55
        # top-left
        $g.DrawLine($bracketPen, $m, $m + $bracketLen, $m, $m)
        $g.DrawLine($bracketPen, $m, $m, $m + $bracketLen, $m)
        # top-right
        $g.DrawLine($bracketPen, $Size-$m, $m + $bracketLen, $Size-$m, $m)
        $g.DrawLine($bracketPen, $Size-$m, $m, $Size-$m-$bracketLen, $m)
        # bottom-left
        $g.DrawLine($bracketPen, $m, $Size-$m-$bracketLen, $m, $Size-$m)
        $g.DrawLine($bracketPen, $m, $Size-$m, $m+$bracketLen, $Size-$m)
        # bottom-right
        $g.DrawLine($bracketPen, $Size-$m, $Size-$m-$bracketLen, $Size-$m, $Size-$m)
        $g.DrawLine($bracketPen, $Size-$m, $Size-$m, $Size-$m-$bracketLen, $Size-$m)
        $bracketPen.Dispose()
    }

    # Document shape (rounded rect with folded top-right corner)
    $docW = $inner * 0.62
    $docH = $inner * 0.8
    $docX = $pad + ($inner - $docW) / 2
    $docY = $pad + ($inner - $docH) / 2
    $fold = $docW * 0.28
    $corner = $docW * 0.08

    $docPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $docPath.AddLine($docX + $corner, $docY, ($docX + $docW) - $fold, $docY)
    $docPath.AddLine(($docX + $docW) - $fold, $docY, $docX + $docW, $docY + $fold)
    $docPath.AddLine($docX + $docW, $docY + $fold, $docX + $docW, ($docY + $docH) - $corner)
    $dcorner = $corner * 2
    $docPath.AddArc($docX + $docW - $dcorner, $docY + $docH - $dcorner, $dcorner, $dcorner, 0, 90)
    $docPath.AddLine($docX + $docW - $corner, $docY + $docH, $docX + $corner, $docY + $docH)
    $docPath.AddArc($docX, $docY + $docH - $dcorner, $dcorner, $dcorner, 90, 90)
    $docPath.AddLine($docX, $docY + $docH - $corner, $docX, $docY + $corner)
    $docPath.AddArc($docX, $docY, $dcorner, $dcorner, 180, 90)
    $docPath.CloseFigure()

    $docBrush = New-Object System.Drawing.SolidBrush($white)
    $g.FillPath($docBrush, $docPath)

    # folded corner triangle (in bg color) to sit on top of the document fill
    $fx1 = $docX + $docW - $fold
    $fy1 = $docY
    $fx2 = $docX + $docW
    $fy2 = $docY + $fold
    $fx3 = $docX + $docW - $fold
    $fy3 = $docY + $fold
    $p1 = New-Object System.Drawing.PointF -ArgumentList @([single]$fx1, [single]$fy1)
    $p2 = New-Object System.Drawing.PointF -ArgumentList @([single]$fx2, [single]$fy2)
    $p3 = New-Object System.Drawing.PointF -ArgumentList @([single]$fx3, [single]$fy3)
    $foldPts = [System.Drawing.PointF[]]@($p1, $p2, $p3)
    $foldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 214, 219, 230))
    $g.FillPolygon($foldBrush, $foldPts)

    # text lines on the document
    $lineWpen = New-Object System.Drawing.Pen($lineGrey, [Math]::Max(1.5, $Size * 0.018))
    $lineWpen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $lineWpen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $lx1 = $docX + $docW * 0.18
    $lx2 = $docX + $docW * 0.82
    for ($i = 0; $i -lt 3; $i++) {
        $ly = $docY + $docH * (0.42 + $i * 0.13)
        $endX = if ($i -eq 2) { $docX + $docW * 0.6 } else { $lx2 }
        $g.DrawLine($lineWpen, $lx1, $ly, $endX, $ly)
    }
    $lineWpen.Dispose()

    # accent scan line across the document
    $scanY = $docY + $docH * 0.24
    $scanPen = New-Object System.Drawing.Pen($accent, [Math]::Max(2, $Size * 0.045))
    $scanPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $scanPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($scanPen, $docX - $inner*0.02, $scanY, $docX + $docW + $inner*0.02, $scanY)
    $scanPen.Dispose()

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$root = "C:\ARNAUD\dossier source claude"
New-ScannerIcon -Size 192 -OutPath "$root\icons\icon-192.png" -Maskable:$false -Opaque:$true
New-ScannerIcon -Size 512 -OutPath "$root\icons\icon-512.png" -Maskable:$false -Opaque:$true
New-ScannerIcon -Size 180 -OutPath "$root\icons\apple-touch-icon.png" -Maskable:$false -Opaque:$true
New-ScannerIcon -Size 512 -OutPath "$root\icons\maskable-icon-512.png" -Maskable:$true -Opaque:$true
New-ScannerIcon -Size 32 -OutPath "$root\icons\favicon-32.png" -Maskable:$false -Opaque:$true

Write-Output "Icons generated."
