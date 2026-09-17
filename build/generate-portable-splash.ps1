Add-Type -AssemblyName System.Drawing

$canvasWidth = 520
$canvasHeight = 180
$brandColor = [System.Drawing.Color]::FromArgb(255, 91, 0)
$white = [System.Drawing.Color]::White
$softWhite = [System.Drawing.Color]::FromArgb(205, 255, 255, 255)
$logoPath = Join-Path $PSScriptRoot '..\public\assets\brand\torras-logo-orange.png'
$outputPath = Join-Path $PSScriptRoot 'portable-splash.bmp'
$fontPath = Join-Path $PSScriptRoot '..\public\assets\fonts\FTTerra-Medium.ttf'

$bitmap = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$bitmap.SetResolution(96, 96)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear($brandColor)

$sourceLogo = [System.Drawing.Bitmap]::FromFile((Resolve-Path $logoPath))
$logoWidth = 252
$logoHeight = [Math]::Round($logoWidth * $sourceLogo.Height / $sourceLogo.Width)
$logoX = [Math]::Round(($canvasWidth - $logoWidth) / 2)
$logoY = 47
$logoAttributes = New-Object System.Drawing.Imaging.ImageAttributes
$colorMatrix = New-Object System.Drawing.Imaging.ColorMatrix
$colorMatrix.Matrix00 = 0
$colorMatrix.Matrix11 = 0
$colorMatrix.Matrix22 = 0
$colorMatrix.Matrix40 = 1
$colorMatrix.Matrix41 = 1
$colorMatrix.Matrix42 = 1
$logoAttributes.SetColorMatrix($colorMatrix)
$graphics.DrawImage(
  $sourceLogo,
  (New-Object System.Drawing.Rectangle($logoX, $logoY, $logoWidth, $logoHeight)),
  0,
  0,
  $sourceLogo.Width,
  $sourceLogo.Height,
  [System.Drawing.GraphicsUnit]::Pixel,
  $logoAttributes
)

$fontCollection = New-Object System.Drawing.Text.PrivateFontCollection
$fontCollection.AddFontFile((Resolve-Path $fontPath))
$labelFont = New-Object System.Drawing.Font($fontCollection.Families[0], 8.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
$labelFormat = New-Object System.Drawing.StringFormat
$labelFormat.Alignment = [System.Drawing.StringAlignment]::Center
$labelFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$labelBrush = New-Object System.Drawing.SolidBrush($softWhite)
$graphics.DrawString('LIVE INTERACTION', $labelFont, $labelBrush, (New-Object System.Drawing.RectangleF(0, 97, $canvasWidth, 20)), $labelFormat)

$trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(65, 255, 255, 255))
$progressBrush = New-Object System.Drawing.SolidBrush($white)
$graphics.FillRectangle($trackBrush, 32, 153, 456, 2)
$graphics.FillRectangle($progressBrush, 32, 153, 150, 2)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

$progressBrush.Dispose()
$trackBrush.Dispose()
$labelBrush.Dispose()
$labelFormat.Dispose()
$labelFont.Dispose()
$fontCollection.Dispose()
$logoAttributes.Dispose()
$sourceLogo.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
