import type { BulkDomsMappingRemediationInput } from '@/src/modules/forecourt/application/bulkDomsMappingRemediation'
import { NextResponse } from 'next/server'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  applyBulkDomsMappingRemediation,
  buildBulkDomsMappingCsvTemplate,
} from '@/src/modules/forecourt/application/bulkDomsMappingRemediation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req) => {
    const url = new URL(req.url)
    if (url.searchParams.get('template') === 'csv') {
      return new NextResponse(buildBulkDomsMappingCsvTemplate(), {
        headers: {
          'content-disposition':
            'attachment; filename="doms-mapping-bulk-template.csv"',
          'content-type': 'text/csv; charset=utf-8',
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        csvTemplate: buildBulkDomsMappingCsvTemplate(),
        safetyNotice:
          'Bulk remediation updates FTC mappings only and requires live DOMS/PSS reconciliation review before apply.',
      },
    })
  },
})

export const POST = defineMutationRoute<BulkDomsMappingRemediationInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await applyBulkDomsMappingRemediation(body, user)
    return NextResponse.json({ success: true, data: result })
  },
})
