import { fail } from '@/src/platform/web/api/response'

import { setCustomerDeletedRepo } from '@/src/modules/customers/infrastructure/customersRepo'

export async function deleteOrRestoreCustomer(params: {
  stationId: string
  customerId: string
  restore?: boolean
}) {
  const customerId = String(params.customerId || '').trim()
  if (!customerId) return fail('Customer id is required', 400)
  const restore = Boolean(params.restore)
  const updated = await setCustomerDeletedRepo({
    stationId: params.stationId,
    customerId,
    restore,
  })
  if (!updated) return fail('Customer not found', 404)
  return { success: true, restored: restore }
}
