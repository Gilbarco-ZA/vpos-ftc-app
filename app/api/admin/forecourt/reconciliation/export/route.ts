import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listDomsMaintenanceSessions } from '@/src/modules/forecourt/application/domsMaintenanceSessions'
import { getDomsConfigurationReconciliation } from '@/src/modules/forecourt/application/getDomsConfigurationReconciliation'
import { listDomsMappingHistory } from '@/src/modules/forecourt/application/listDomsMappingHistory'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const safeFilePart = (value: string) => {
  const cleaned = value
    .trim()
    .replaceAll(' ', '-')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      const isNumber = code >= 48 && code <= 57
      const isUpperAlpha = code >= 65 && code <= 90
      const isLowerAlpha = code >= 97 && code <= 122
      return (
        isNumber ||
        isUpperAlpha ||
        isLowerAlpha ||
        char === '_' ||
        char === '.' ||
        char === '-'
      )
    })
    .join('')
    .slice(0, 80)

  return cleaned || 'station'
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const reconciliation = await getDomsConfigurationReconciliation(
      user.stationId,
    )
    const mappingHistory = await listDomsMappingHistory(
      user.stationId,
      new URLSearchParams({ limit: '50' }),
    )
    const maintenanceSessions = await listDomsMaintenanceSessions(
      user.stationId,
      new URLSearchParams({ limit: '20' }),
    )
    const generatedAt = new Date().toISOString()
    const payload = {
      exportType: 'doms-configuration-reconciliation',
      generatedAt,
      stationId: user.stationId,
      safetyNotice:
        'This export is diagnostic only. Confirm all suggested mapping changes against the physical site and PSS Configurator before changing FTC mappings. Do not use this export to modify PSS configuration automatically.',
      reconciliation,
      mappingHistory: mappingHistory.data,
      maintenanceSessions: maintenanceSessions.data,
    }
    const filename = `doms-reconciliation-${safeFilePart(user.stationId)}-${generatedAt
      .replaceAll('-', '')
      .replaceAll(':', '')
      .replaceAll('.', '')}.json`

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'content-disposition': `attachment; filename="${filename}"`,
        'content-type': 'application/json; charset=utf-8',
      },
    })
  },
})
