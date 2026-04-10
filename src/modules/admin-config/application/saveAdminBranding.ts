import path from 'path'

import { fail } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { persistBrandLogo } from '@/src/shared/branding/settings'
import { brandingSettingsSchema } from '@/src/shared/validations'

import {
  getBrandingSettingsRepo,
  saveBrandingSettingsRepo,
} from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function saveAdminBranding(args: {
  stationId: string
  userId: string
  body: Record<string, any>
}) {
  const parsed = brandingSettingsSchema.safeParse({
    primaryColor: args.body.primaryColor,
    secondaryColor: args.body.secondaryColor,
    stationDisplayName: args.body.stationDisplayName,
    receiptFooterText: args.body.receiptFooterText,
    receiptHeaderText: args.body.receiptHeaderText,
  })
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  let logoPath: string | null =
    typeof args.body.logoPath === 'string' && args.body.logoPath.trim()
      ? args.body.logoPath.trim()
      : null

  const logoFile = args.body.logo
  if (logoFile && typeof logoFile !== 'string') {
    try {
      logoPath = await persistBrandLogo(logoFile as File)
    } catch (err: any) {
      return fail(String(err?.message || 'Invalid logo file'), 400)
    }
  }

  await saveBrandingSettingsRepo({
    stationId: args.stationId,
    logoPath,
    ...parsed.data,
  })

  await createAuditLog({
    stationId: args.stationId,
    userId: args.userId,
    action: 'BRANDING_UPDATED',
    entityType: 'branding_settings',
    metadata: {
      ...parsed.data,
      logoPath: logoPath ? path.basename(logoPath) : null,
    },
  }).catch(() => {})

  return await getBrandingSettingsRepo(args.stationId)
}
