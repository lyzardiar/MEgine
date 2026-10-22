# Author: MiYu
# Rebuilds generated animation atlases around a stable visual origin.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artRoot = Join-Path $projectRoot 'Assets\Art\Generated'

function Get-OpaqueBounds {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [System.Drawing.Rectangle]$Cell
    )

    $minX = $Cell.Right
    $minY = $Cell.Bottom
    $maxX = $Cell.Left - 1
    $maxY = $Cell.Top - 1
    for ($y = $Cell.Top; $y -lt $Cell.Bottom; $y++) {
        for ($x = $Cell.Left; $x -lt $Cell.Right; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -le 12) {
                continue
            }
            $minX = [Math]::Min($minX, $x)
            $minY = [Math]::Min($minY, $y)
            $maxX = [Math]::Max($maxX, $x)
            $maxY = [Math]::Max($maxY, $y)
        }
    }
    if ($maxX -lt $minX -or $maxY -lt $minY) {
        throw "Animation cell $Cell has no visible pixels."
    }
    return [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
}

function Export-AlignedAtlas {
    param(
        [string]$Source,
        [string]$Target,
        [int[]]$XCuts,
        [int[]]$YCuts,
        [int[]]$Baselines
    )

    $sourceBitmap = [System.Drawing.Bitmap]::new($Source)
    $targetBitmap = [System.Drawing.Bitmap]::new(
        $sourceBitmap.Width,
        $sourceBitmap.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($targetBitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

        for ($row = 0; $row -lt $YCuts.Length - 1; $row++) {
            for ($column = 0; $column -lt $XCuts.Length - 1; $column++) {
                $cell = [System.Drawing.Rectangle]::FromLTRB(
                    $XCuts[$column],
                    $YCuts[$row],
                    $XCuts[$column + 1],
                    $YCuts[$row + 1]
                )
                $bounds = Get-OpaqueBounds -Bitmap $sourceBitmap -Cell $cell
                $cellCenterX = $cell.Left + ($cell.Width / 2.0)
                $targetX = [int][Math]::Round($cellCenterX - ($bounds.Width / 2.0))
                $targetY = $cell.Top + $Baselines[$row] - $bounds.Height
                $destination = [System.Drawing.Rectangle]::new($targetX, $targetY, $bounds.Width, $bounds.Height)
                $graphics.DrawImage($sourceBitmap, $destination, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
            }
        }

        $targetBitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $targetBitmap.Dispose()
        $sourceBitmap.Dispose()
    }
}

function Export-AlignedEnemyAtlas {
    param(
        [string]$Source,
        [string]$Target
    )

    $sourceBitmap = [System.Drawing.Bitmap]::new($Source)
    $targetBitmap = [System.Drawing.Bitmap]::new(1254, 1254, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($targetBitmap)
    $sourceXCuts = @(
        @(0, 364, 656, 919, 1254),
        @(0, 345, 633, 906, 1254),
        @(0, 351, 613, 900, 1254),
        @(0, 327, 619, 908, 1254)
    )
    $targetCuts = @(0, 314, 627, 941, 1254)
    $baselines = @(290, 284, 276, 248)
    $rowScales = @(0.86, 1.0, 1.0, 1.0)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        for ($row = 0; $row -lt 4; $row++) {
            for ($column = 0; $column -lt 4; $column++) {
                $sourceCell = [System.Drawing.Rectangle]::FromLTRB(
                    $sourceXCuts[$row][$column],
                    $targetCuts[$row],
                    $sourceXCuts[$row][$column + 1],
                    $targetCuts[$row + 1]
                )
                $bounds = Get-OpaqueBounds -Bitmap $sourceBitmap -Cell $sourceCell
                $width = [int][Math]::Round($bounds.Width * $rowScales[$row])
                $height = [int][Math]::Round($bounds.Height * $rowScales[$row])
                $targetCenterX = ($targetCuts[$column] + $targetCuts[$column + 1]) / 2.0
                $targetX = [int][Math]::Round($targetCenterX - ($width / 2.0))
                $targetY = $targetCuts[$row] + $baselines[$row] - $height
                $destination = [System.Drawing.Rectangle]::new($targetX, $targetY, $width, $height)
                $graphics.DrawImage($sourceBitmap, $destination, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
            }
        }

        $targetBitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $targetBitmap.Dispose()
        $sourceBitmap.Dispose()
    }
}

function Export-AlignedWardenAtlas {
    param(
        [string]$Source,
        [string]$Target
    )

    $sourceBitmap = [System.Drawing.Bitmap]::new($Source)
    $targetBitmap = [System.Drawing.Bitmap]::new(1536, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($targetBitmap)
    $sourceXCuts = @(
        @(0, 530, 970, 1536),
        @(0, 510, 918, 1536)
    )
    $targetXCuts = @(0, 512, 1024, 1536)
    $targetYCuts = @(0, 512, 1024)
    $rowScales = @(
        @(0.94, 0.94, 0.94),
        @(0.94, 0.94, 0.84)
    )
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        for ($row = 0; $row -lt 2; $row++) {
            for ($column = 0; $column -lt 3; $column++) {
                $sourceCell = [System.Drawing.Rectangle]::FromLTRB(
                    $sourceXCuts[$row][$column],
                    $targetYCuts[$row],
                    $sourceXCuts[$row][$column + 1],
                    $targetYCuts[$row + 1]
                )
                $bounds = Get-OpaqueBounds -Bitmap $sourceBitmap -Cell $sourceCell
                $width = [int][Math]::Round($bounds.Width * $rowScales[$row][$column])
                $height = [int][Math]::Round($bounds.Height * $rowScales[$row][$column])
                $targetCenterX = ($targetXCuts[$column] + $targetXCuts[$column + 1]) / 2.0
                $targetX = [int][Math]::Round($targetCenterX - ($width / 2.0))
                $targetY = $targetYCuts[$row] + 470 - $height
                $destination = [System.Drawing.Rectangle]::new($targetX, $targetY, $width, $height)
                $graphics.DrawImage($sourceBitmap, $destination, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
            }
        }
        $targetBitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $targetBitmap.Dispose()
        $sourceBitmap.Dispose()
    }
}

function Assert-AlignedAtlas {
    param(
        [string]$Path,
        [int[]]$XCuts,
        [int[]]$YCuts,
        [int[]]$ExpectedBaselines,
        [string]$Label
    )

    $bitmap = [System.Drawing.Bitmap]::new($Path)
    try {
        for ($row = 0; $row -lt $YCuts.Length - 1; $row++) {
            for ($column = 0; $column -lt $XCuts.Length - 1; $column++) {
                $cell = [System.Drawing.Rectangle]::FromLTRB(
                    $XCuts[$column],
                    $YCuts[$row],
                    $XCuts[$column + 1],
                    $YCuts[$row + 1]
                )
                $bounds = Get-OpaqueBounds -Bitmap $bitmap -Cell $cell
                $expectedCenter = ($cell.Left + $cell.Right) / 2.0
                $actualCenter = ($bounds.Left + $bounds.Right) / 2.0
                $actualBaseline = $bounds.Bottom - $cell.Top
                if ([Math]::Abs($actualCenter - $expectedCenter) -gt 1.5) {
                    throw "$Label frame [$row,$column] center drifted by $([Math]::Round($actualCenter - $expectedCenter, 2)) pixels."
                }
                if ([Math]::Abs($actualBaseline - $ExpectedBaselines[$row]) -gt 1) {
                    throw "$Label frame [$row,$column] baseline is $actualBaseline, expected $($ExpectedBaselines[$row])."
                }
            }
        }
    }
    finally {
        $bitmap.Dispose()
    }
    Write-Host "$Label alignment verified: centered frames and stable baselines."
}

Export-AlignedWardenAtlas `
    -Source (Join-Path $artRoot 'eclipse-warden-sheet.png') `
    -Target (Join-Path $artRoot 'eclipse-warden-aligned.png')

Export-AlignedEnemyAtlas `
    -Source (Join-Path $artRoot 'enemies-animated-atlas.png') `
    -Target (Join-Path $artRoot 'enemies-aligned-atlas.png')

Assert-AlignedAtlas `
    -Path (Join-Path $artRoot 'eclipse-warden-aligned.png') `
    -XCuts @(0, 512, 1024, 1536) `
    -YCuts @(0, 512, 1024) `
    -ExpectedBaselines @(470, 470) `
    -Label 'Warden'

Assert-AlignedAtlas `
    -Path (Join-Path $artRoot 'enemies-aligned-atlas.png') `
    -XCuts @(0, 314, 627, 941, 1254) `
    -YCuts @(0, 314, 627, 941, 1254) `
    -ExpectedBaselines @(290, 284, 276, 248) `
    -Label 'Enemy'

Write-Host "Aligned animation atlases written to $artRoot"
