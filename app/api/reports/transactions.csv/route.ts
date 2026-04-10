import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { exportTransactionsCsv } from '@/src/modules/reports/application/exportTransactionsCsv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const csv = await exportTransactionsCsv(
      user.stationId,
      searchParams.get('startDate'),
      searchParams.get('endDate'),
    )
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename=transactions.csv',
      },
    })
  },
})
