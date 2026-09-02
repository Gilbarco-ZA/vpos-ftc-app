import fs from 'fs/promises'
import path from 'path'
import type { EscposLine } from '@/src/shared/printers/types'

import { resolveBrandingDir } from '@/src/shared/branding/settings'
import { rasterizePngForEscpos } from '@/src/shared/printers/pngRaster'

const LEGAL_IMAGE_FILES = {
  'tra-receipt-start': 'TRA_receipt_start.png',
  'tra-receipt-end': 'TRA_receipt_end.png',
} as const

const legalImageCache = new Map<
  string,
  Extract<EscposLine, { type: 'image' }>
>()

const fallbackForAsset = (
  asset: Extract<EscposLine, { type: 'image' }>['asset'],
): EscposLine[] => {
  if (asset === 'tra-receipt-start') {
    return [
      {
        type: 'text',
        value: '***START OF LEGAL RECEIPT***',
        align: 'center',
        bold: true,
      },
    ]
  }
  if (asset === 'tra-receipt-end') {
    return [
      {
        type: 'text',
        value: '***END OF LEGAL RECEIPT***',
        align: 'center',
        bold: true,
      },
    ]
  }
  return []
}

const resolveBrandLogoFile = (logoPath: string | null | undefined) => {
  const raw = String(logoPath ?? '').trim()
  if (!raw) return null
  const filename = path.basename(raw)
  if (!/^logo\.png$/i.test(filename)) return null
  return path.join(resolveBrandingDir(), filename)
}

const loadRasterLine = async (args: {
  asset: Extract<EscposLine, { type: 'image' }>['asset']
  filename: string
  maxWidthDots: number
  useCache?: boolean
}) => {
  const cacheKey = `${args.filename}:${args.maxWidthDots}`
  if (args.useCache && legalImageCache.has(cacheKey)) {
    return legalImageCache.get(cacheKey) ?? null
  }

  try {
    const source = await fs.readFile(args.filename)
    const raster = rasterizePngForEscpos(source, {
      maxWidthDots: args.maxWidthDots,
    })
    const line: Extract<EscposLine, { type: 'image' }> = {
      type: 'image',
      asset: args.asset,
      ...raster,
    }
    if (args.useCache) legalImageCache.set(cacheKey, line)
    return line
  } catch {
    return null
  }
}

export async function resolveReceiptEscposImages(
  lines: EscposLine[],
  options: {
    widthCharacters: number
    logoPath?: string | null
  },
): Promise<EscposLine[]> {
  const printableWidthDots = Math.max(
    192,
    Math.min(576, Math.floor(options.widthCharacters) * 12),
  )
  const resolved: EscposLine[] = []

  for (const line of lines) {
    if (line.type !== 'image' || line.dataBase64) {
      resolved.push(line)
      continue
    }

    if (line.asset === 'branding-logo') {
      const logoFile = resolveBrandLogoFile(options.logoPath)
      const logo = logoFile
        ? await loadRasterLine({
            asset: line.asset,
            filename: logoFile,
            maxWidthDots: Math.min(320, printableWidthDots),
          })
        : null
      if (logo) resolved.push(logo)
      continue
    }

    const legalFilename = LEGAL_IMAGE_FILES[line.asset]
    const legalImage = await loadRasterLine({
      asset: line.asset,
      filename: path.join(
        process.cwd(),
        'public',
        'assets',
        'tra',
        legalFilename,
      ),
      maxWidthDots: printableWidthDots,
      useCache: true,
    })
    if (legalImage) resolved.push(legalImage)
    else resolved.push(...fallbackForAsset(line.asset))
  }

  return resolved
}
