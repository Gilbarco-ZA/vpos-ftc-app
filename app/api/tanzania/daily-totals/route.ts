import {
  badRequestError,
  conflictError,
  notFoundError,
} from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
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
  forceTanzaniaDailyTotalSubmission,
  getTanzaniaDailyTotalsDashboard,
  updateTanzaniaDailyTotalsSchedule,
} from '@/src/modules/tanzania-fiscal/application/dailyTotalsAdmin'
import { normalizeTanzaniaDailyTotalsSendTime } from '@/src/modules/tanzania-fiscal/domain/dailyTotalsSchedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MutationBody =
  | { action: 'save-schedule'; sendTime?: unknown }
  | { action: 'force-send'; businessDate?: string | null }

async function assertTanzaniaDailyTotalsRoute(stationId: string) {
  const country = await getStationCountryCode(stationId)
  if (!isTanzaniaCountry(country)) {
    throw notFoundError(
      'Tanzania daily totals are not available for this station.',
    )
  }
}

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user }) => {
    await assertTanzaniaDailyTotalsRoute(user.stationId)
    return ok(await getTanzaniaDailyTotalsDashboard(user.stationId))
  },
})

export const POST = defineMutationRoute<MutationBody>({
  roles: ['administrator'],
  handler: async (req, { user, body }) => {
    await assertTanzaniaDailyTotalsRoute(user.stationId)
    const action = String(body?.action || '').trim()

    if (action === 'save-schedule') {
      let sendTime: string
      try {
        sendTime = normalizeTanzaniaDailyTotalsSendTime(
          'sendTime' in body ? body.sendTime : null,
        )
      } catch (error) {
        throw badRequestError(
          error instanceof Error ? error.message : 'Invalid send time.',
        )
      }

      const before = await getTanzaniaDailyTotalsDashboard(user.stationId)
      const schedule = await updateTanzaniaDailyTotalsSchedule(
        user.stationId,
        sendTime,
      )
      await createAuditLog({
        stationId: user.stationId,
        userId: user.id,
        action: 'SETTINGS_UPDATED',
        entityType: 'tanzania_daily_totals_schedule',
        entityId: user.stationId,
        oldValues: { sendTime: before.sendTime },
        newValues: { sendTime: schedule.sendTime },
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
      })
      return ok(schedule)
    }

    if (action === 'force-send') {
      const businessDate = String(
        'businessDate' in body ? body.businessDate || '' : '',
      ).trim()
      if (businessDate && !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
        throw badRequestError('Business date must use YYYY-MM-DD format.')
      }

      try {
        const result = await forceTanzaniaDailyTotalSubmission(
          user.stationId,
          businessDate || null,
        )
        await createAuditLog({
          stationId: user.stationId,
          userId: user.id,
          action: 'SYNC_COMPLETED',
          entityType: 'tanzania_daily_total',
          entityId: businessDate || 'latest-closed-day',
          metadata: {
            trigger: 'manual-force-send',
            result,
          },
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
          userAgent: req.headers.get('user-agent') || undefined,
        })
        return ok(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('cannot be force-sent while its status')) {
          throw conflictError(message)
        }
        if (
          message.includes('Business date must use') ||
          message.includes('can only be force-sent for a closed business date')
        ) {
          throw badRequestError(message)
        }
        throw error
      }
    }

    throw badRequestError('Unsupported Tanzania daily totals action.')
  },
})
