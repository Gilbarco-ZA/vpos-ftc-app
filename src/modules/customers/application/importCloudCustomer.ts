import { fail } from '@/src/platform/web/api/response'
import { auditCustomerImported } from '@/src/shared/audit/log'
import { queryOne as azOne } from '@/src/shared/db/azureSql'

import {
  getCustomerForStationRepo,
  getCustomerRowByIdRepo,
  importCloudCustomerRepo,
} from '@/src/modules/customers/infrastructure/customersRepo'

export async function importCloudCustomer(params: {
  stationId: string
  userId: string
  body: Record<string, any>
}) {
  const cloudCustomerId = String(params.body.cloudCustomerId || '').trim()
  if (!cloudCustomerId) return fail('cloudCustomerId is required', 400)

  const cloud = await azOne<any>(
    `
    SELECT c.*
    FROM customers c
    JOIN customer_stations cs ON cs.customer_id = c.id
    WHERE c.id = @id AND cs.station_id = @stationId AND c.deleted_at IS NULL
    `,
    { id: cloudCustomerId, stationId: params.stationId },
  )

  if (!cloud) return fail('Cloud customer not found for this station', 404)

  const localId = await importCloudCustomerRepo({
    stationId: params.stationId,
    cloudCustomerId,
    cloud,
  })

  await auditCustomerImported(
    params.stationId,
    params.userId,
    localId,
    cloudCustomerId,
    {
      tin: cloud.tin,
      buyerName: cloud.buyer_name,
    },
  ).catch(() => {})

  const local =
    (await getCustomerForStationRepo({
      stationId: params.stationId,
      customerId: localId,
    })) || (await getCustomerRowByIdRepo(localId))

  return local
}
