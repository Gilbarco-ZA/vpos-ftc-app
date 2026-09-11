import { z } from 'zod'

import { fail, ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  getStationCountryCode,
  isTanzaniaCountry,
} from '@/src/modules/tanzania-fiscal/application/country'
import {
  getTanzaniaGrossTotalSummary,
  setTanzaniaFiscalOpeningValues,
} from '@/src/modules/tanzania-fiscal/application/grossTotalOpening'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const nullableTrimmed = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const updateSchema = z
  .object({
    openingGrossTotal: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.coerce
        .number({ required_error: 'Opening gross total is required.' })
        .finite()
        .min(0, 'Opening gross total cannot be negative.')
        .max(
          1_000_000_000_000_000,
          'Opening gross total exceeds the supported range.',
        ),
    ),
    dailyCounter: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? Number.NaN : value,
      z.coerce
        .number()
        .int('Daily counter must be a whole number.')
        .min(0, 'Daily counter cannot be negative.')
        .max(
          Number.MAX_SAFE_INTEGER,
          'Daily counter exceeds the supported range.',
        )
        .optional(),
    ),
    globalCounter: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? Number.NaN : value,
      z.coerce
        .number()
        .int('Global counter must be a whole number.')
        .min(0, 'Global counter cannot be negative.')
        .max(
          Number.MAX_SAFE_INTEGER,
          'Global counter exceeds the supported range.',
        )
        .optional(),
    ),
    deviceIdOverride: z.preprocess(
      nullableTrimmed,
      z
        .string()
        .max(191, 'Device ID cannot exceed 191 characters.')
        .nullable()
        .optional(),
    ),
    receiptVerificationPrefixMode: z.enum(['registered', 'manual']).optional(),
    receiptVerificationPrefixOverride: z.preprocess(
      (value) => {
        const trimmed = nullableTrimmed(value)
        return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed
      },
      z
        .string()
        .regex(
          /^[A-Z0-9]{6}$/,
          'Receipt verification prefix must contain exactly 6 letters or numbers.',
        )
        .nullable()
        .optional(),
    ),
    receiptVerificationUrlMode: z
      .enum(['development', 'production', 'manual'])
      .optional(),
    receiptVerificationUrlOverride: z.preprocess(
      nullableTrimmed,
      z
        .string()
        .max(500, 'TRA verification URL cannot exceed 500 characters.')
        .nullable()
        .optional(),
    ),
  })
  .superRefine((values, context) => {
    if (
      values.receiptVerificationPrefixOverride !== undefined &&
      values.receiptVerificationPrefixMode === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiptVerificationPrefixMode'],
        message:
          'Receipt verification prefix mode is required when updating the override.',
      })
    }
    if (
      values.receiptVerificationPrefixMode === 'manual' &&
      !values.receiptVerificationPrefixOverride
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiptVerificationPrefixOverride'],
        message:
          'A manual receipt verification prefix is required when Manual override is selected.',
      })
    }
    if (
      values.receiptVerificationUrlOverride !== undefined &&
      values.receiptVerificationUrlMode === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiptVerificationUrlMode'],
        message:
          'Receipt verification URL mode is required when updating the manual URL.',
      })
    }
    if (
      values.receiptVerificationUrlMode === 'manual' &&
      !values.receiptVerificationUrlOverride
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiptVerificationUrlOverride'],
        message:
          'A manual TRA receipt verification URL is required when Manual URL is selected.',
      })
    }
  })

async function ensureTanzaniaStation(stationId: string) {
  const country = await getStationCountryCode(stationId)
  if (!isTanzaniaCountry(country)) {
    return fail(
      `Tanzania fiscal opening values can only be configured for Tanzania stations. Current station country: ${country || 'not configured'}.`,
      400,
    )
  }
  return null
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const countryFailure = await ensureTanzaniaStation(user.stationId)
    if (countryFailure) return countryFailure
    return ok(await getTanzaniaGrossTotalSummary(user.stationId))
  },
})

export const PATCH = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  handler: async (req, { user, body }) => {
    const countryFailure = await ensureTanzaniaStation(user.stationId)
    if (countryFailure) return countryFailure

    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || 'Invalid fiscal opening values.',
        400,
      )
    }

    const before = await getTanzaniaGrossTotalSummary(user.stationId)
    let after
    try {
      after = await setTanzaniaFiscalOpeningValues(user.stationId, {
        openingGrossTotal: parsed.data.openingGrossTotal,
        dailyCounter: parsed.data.dailyCounter,
        globalCounter: parsed.data.globalCounter,
        deviceIdOverride: parsed.data.deviceIdOverride,
        receiptVerificationPrefixMode:
          parsed.data.receiptVerificationPrefixMode,
        receiptVerificationPrefixOverride:
          parsed.data.receiptVerificationPrefixOverride,
        receiptVerificationUrlMode: parsed.data.receiptVerificationUrlMode,
        receiptVerificationUrlOverride:
          parsed.data.receiptVerificationUrlOverride,
      })
    } catch (error: any) {
      return fail(
        String(error?.message || error || 'Invalid Tanzania fiscal settings.'),
        400,
      )
    }

    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'CONFIG_UPDATED',
      entityType: 'tanzania_gross_total',
      oldValues: {
        openingGrossTotal: before.openingGrossTotal,
        effectiveGrossTotal: before.effectiveGrossTotal,
        dailyCounter: before.dailyCounter,
        globalCounter: before.globalCounter,
        deviceIdOverride: before.deviceIdOverride,
        registeredReceiptCode: before.registeredReceiptCode,
        receiptVerificationPrefixMode: before.receiptVerificationPrefixMode,
        receiptVerificationPrefixOverride:
          before.receiptVerificationPrefixOverride,
        effectiveReceiptVerificationPrefix:
          before.effectiveReceiptVerificationPrefix,
        receiptVerificationUrlMode: before.receiptVerificationUrlMode,
        receiptVerificationUrlOverride: before.receiptVerificationUrlOverride,
        effectiveReceiptVerificationUrlBase:
          before.effectiveReceiptVerificationUrlBase,
      },
      newValues: {
        openingGrossTotal: after.openingGrossTotal,
        effectiveGrossTotal: after.effectiveGrossTotal,
        dailyCounter: after.dailyCounter,
        globalCounter: after.globalCounter,
        deviceIdOverride: after.deviceIdOverride,
        registeredReceiptCode: after.registeredReceiptCode,
        receiptVerificationPrefixMode: after.receiptVerificationPrefixMode,
        receiptVerificationPrefixOverride:
          after.receiptVerificationPrefixOverride,
        effectiveReceiptVerificationPrefix:
          after.effectiveReceiptVerificationPrefix,
        receiptVerificationUrlMode: after.receiptVerificationUrlMode,
        receiptVerificationUrlOverride: after.receiptVerificationUrlOverride,
        effectiveReceiptVerificationUrlBase:
          after.effectiveReceiptVerificationUrlBase,
      },
      ipAddress:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      metadata: {
        localFiscalTurnover: after.localFiscalTurnover,
        reason: 'tanzania_fiscal_opening_values',
      },
    }).catch(() => {})

    return ok(after)
  },
})
