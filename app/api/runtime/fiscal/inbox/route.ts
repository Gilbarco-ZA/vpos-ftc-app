import type { FiscalInboxListFilters } from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'
import type { FiscalInboxStatus } from '@/src/modules/fiscal-inbox/domain/fiscal-inbox-status'

import { fail, ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listFiscalInboxQuery } from '@/src/modules/fiscal-inbox/application/queries/list-fiscal-inbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FiscalInboxTopic = FiscalInboxListFilters['topic']

function asPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function asNonNegativeInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback
}

function parseStatus(value: string | null): FiscalInboxStatus | 'ANY' {
  const status = String(value || 'ANY').toUpperCase()
  if (
    ['ANY', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD'].includes(
      status,
    )
  ) {
    return status as FiscalInboxStatus | 'ANY'
  }
  return 'ANY'
}

function parseTopic(value: string | null): FiscalInboxTopic {
  const topic = String(value || 'ANY').toLowerCase()
  if (
    topic === 'fiscal' ||
    topic === 'pos' ||
    topic === 'external_fiscalization'
  ) {
    return topic as FiscalInboxTopic
  }
  return 'ANY'
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const searchParams = new URL(req.url).searchParams
    const stationId = String(
      searchParams.get('stationId') || user.stationId || '',
    ).trim()
    if (!stationId) return fail('stationId is required')

    const result = await listFiscalInboxQuery({
      stationId,
      status: parseStatus(searchParams.get('status')),
      topic: parseTopic(searchParams.get('topic')),
      limit: asPositiveInt(searchParams.get('limit'), 50),
      offset: asNonNegativeInt(searchParams.get('offset'), 0),
    })

    return ok(result)
  },
})
