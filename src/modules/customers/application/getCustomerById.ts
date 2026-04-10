import { notFound } from '@/src/platform/web/api/response'

import {
  getCustomerForStationRepo,
  mapCustomerRow,
} from '@/src/modules/customers/infrastructure/customersRepo'

export async function getCustomerById(params: {
  stationId: string
  customerId: string
}) {
  const customerId = String(params.customerId || '').trim()
  if (!customerId) return notFound('Customer id is required', { status: 400 })

  const row = await getCustomerForStationRepo({
    stationId: params.stationId,
    customerId,
  })
  if (!row) return notFound('Not found')

  return {
    ...mapCustomerRow(row),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
