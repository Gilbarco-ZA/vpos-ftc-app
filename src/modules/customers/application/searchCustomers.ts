import { fail } from '@/src/platform/web/api/response'

import { searchCustomersRepo } from '@/src/modules/customers/infrastructure/customersRepo'

export async function searchCustomers(params: {
  stationId: string
  query: string
}) {
  const query = String(params.query || '').trim()
  if (!query) return fail('query is required', 400)

  return searchCustomersRepo({
    stationId: params.stationId,
    query,
  })
}
