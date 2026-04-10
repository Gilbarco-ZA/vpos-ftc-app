import * as fs from 'fs/promises'
import path from 'path'

import { getPrimaryDataRoot } from '@/src/platform/config'
import { query, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

const MAX_LOGO_BYTES = 2 * 1024 * 1024

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
  return `/branding/${filename}`
}

export async function getBrandingSettings(stationId: string) {
  return await queryOne<BrandingSettingsRow>(
    `SELECT * FROM branding_settings WHERE station_id = $1`,
    [stationId],
  )
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
