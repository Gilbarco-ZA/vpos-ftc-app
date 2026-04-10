import { fail } from '@/src/platform/web/api/response'

import { setCustomerDeletedRepo } from '@/src/modules/customers/infrastructure/customersRepo'

export async function deleteOrRestoreCustomer(params: {
  customerId: string
  restore?: boolean
}) {
  const customerId = String(params.customerId || '').trim()
  if (!customerId) return fail('Customer id is required', 400)
  const restore = Boolean(params.restore)
  await setCustomerDeletedRepo({ customerId, restore })
  return { success: true, restored: restore }
}
