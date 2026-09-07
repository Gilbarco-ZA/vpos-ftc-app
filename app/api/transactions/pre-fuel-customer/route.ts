import { fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { authorizePendingPreFuelCustomer } from '@/src/modules/transactions/application/commands/authorize-pre-fuel-customer'
import {
  allocatePreFuelCustomer,
  cancelPendingPreFuelCustomer,
  getPreFuelCustomerState,
} from '@/src/modules/transactions/application/commands/manage-pre-fuel-customer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    return ok(await getPreFuelCustomerState(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    try {
      if (body.action === 'cancel') {
        return ok(
          await cancelPendingPreFuelCustomer({
            stationId: user.stationId,
            allocationId: body.allocationId,
          }),
        )
      }

      if (body.action === 'authorize') {
        return ok(
          await authorizePendingPreFuelCustomer({
            stationId: user.stationId,
            allocationId: body.allocationId,
          }),
        )
      }

      return ok(
        await allocatePreFuelCustomer({
          stationId: user.stationId,
          userId: user.id,
          pumpNumber: body.pumpNumber,
          nozzleNumber: body.nozzleNumber,
          nozzleId: body.nozzleId,
          customerId: body.customerId,
        }),
      )
    } catch (error: any) {
      return fail(
        String(error?.message || error || 'Unable to update pre-fuel customer'),
        Number(error?.status || 400),
      )
    }
  },
})
