import { fail } from '@/src/platform/web/api/response'
import { queryAll as azAll } from '@/src/shared/db/azureSql'

import { searchCustomersRepo } from '@/src/modules/customers/infrastructure/customersRepo'

export async function searchCustomers(params: {
  stationId: string
  query: string
  includeCloud?: boolean
}) {
  const query = String(params.query || '').trim()
  if (!query) return fail('query is required', 400)

  return searchCustomersRepo({
    stationId: params.stationId,
    query,
    includeCloud: Boolean(params.includeCloud),
    azureSearch: async (q) =>
      azAll<any>(
        `
        SELECT TOP 50 c.*
        FROM customers c
        JOIN customer_stations cs ON cs.customer_id = c.id
        WHERE cs.station_id = @stationId
          AND c.deleted_at IS NULL
          AND (c.tin LIKE '%' + @q + '%' OR c.buyer_name LIKE '%' + @q + '%')
        ORDER BY cs.last_seen_at DESC
        `,
        { stationId: params.stationId, q },
      ),
  })
}
