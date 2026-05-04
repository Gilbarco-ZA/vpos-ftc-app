import * as fs from 'fs/promises'
import path from 'path'

import { getPrimaryDataRoot } from '@/src/platform/config'
import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

const MAX_LOGO_BYTES = 2 * 1024 * 1024

export const BRANDING_ASSET_ROUTE_BASE = '/api/branding'

export const normalizeBrandLogoPath = (
  pathValue: string | null | undefined,
): string | null => {
  const normalized = String(pathValue ?? '').trim()
  if (!normalized) return null
  if (normalized.startsWith(`${BRANDING_ASSET_ROUTE_BASE}/`)) return normalized
  if (normalized.startsWith('/branding/')) {
    return `${BRANDING_ASSET_ROUTE_BASE}/${normalized.split('/').pop()}`
  }
  return normalized
}

export const resolveBrandForegroundColor = (
  colorValue: string | null | undefined,
): '#0a0a0a' | '#ffffff' => {
  const raw = String(colorValue ?? '').trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  const expanded = /^[0-9a-fA-F]{3}$/.test(hex)
    ? hex
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : hex

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return '#ffffff'

  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  const luminance =
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return luminance > 0.46 ? '#0a0a0a' : '#ffffff'
}

export type BrandingSettingsRow = Record<string, unknown>

export const resolveBrandingDir = (): string => {
  return path.join(getPrimaryDataRoot(), 'branding')
}

export const detectLogoExt = (file: File): string | null => {
  const type = (file as any).type as string | undefined
  const name = (file as any).name as string | undefined

  const byType: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/svg+xml': '.svg',
  }
  if (type && byType[type]) return byType[type]

  if (name) {
    const ext = path.extname(name).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext
    }
  }

  return null
}

export async function persistBrandLogo(file: File): Promise<string> {
  const ext = detectLogoExt(file)
  if (!ext) throw new Error('Unsupported logo file type')

  const ab = await file.arrayBuffer()
  const buffer = Buffer.from(ab)
  if (buffer.byteLength > MAX_LOGO_BYTES) {
    throw new Error('Logo exceeds maximum size of 2MB')
  }

  const brandingDir = resolveBrandingDir()
  await fs.mkdir(brandingDir, { recursive: true })
  const filename = `logo${ext}`
  const absolutePath = path.join(brandingDir, filename)
  await fs.writeFile(absolutePath, buffer)
  return `${BRANDING_ASSET_ROUTE_BASE}/${filename}`
}

export async function getBrandingSettings(stationId: string) {
  const row = await queryOne<BrandingSettingsRow>(
    `SELECT * FROM branding_settings WHERE station_id = $1`,
    [stationId],
  )

  if (!row) return null

  return {
    ...row,
    logo_path: normalizeBrandLogoPath((row as any)?.logo_path ?? null),
  }
}

export async function updateBrandingSettings(args: {
  stationId: string
  logoPath?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  stationDisplayName?: string | null
  receiptFooterText?: string | null
  receiptHeaderText?: string | null
}) {
  await query(
    `
      INSERT INTO branding_settings (
        id,
        station_id,
        logo_path,
        primary_color,
        secondary_color,
        station_display_name,
        receipt_footer_text,
        receipt_header_text,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (station_id)
      DO UPDATE SET
        logo_path = COALESCE($3, branding_settings.logo_path),
        primary_color = COALESCE($4, branding_settings.primary_color),
        secondary_color = COALESCE($5, branding_settings.secondary_color),
        station_display_name = COALESCE($6, branding_settings.station_display_name),
        receipt_footer_text = COALESCE($7, branding_settings.receipt_footer_text),
        receipt_header_text = COALESCE($8, branding_settings.receipt_header_text),
        updated_at = NOW()
    `,
    [
      uuidv4(),
      args.stationId,
      args.logoPath ?? null,
      args.primaryColor ?? null,
      args.secondaryColor ?? null,
      args.stationDisplayName ?? null,
      args.receiptFooterText ?? null,
      args.receiptHeaderText ?? null,
    ],
  )

  return await getBrandingSettings(args.stationId)
}
