import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { deleteOrRestoreCustomer } from '@/src/modules/customers/application/deleteOrRestoreCustomer'
import { getCustomerById } from '@/src/modules/customers/application/getCustomerById'
import { updateCustomerRecord } from '@/src/modules/customers/application/updateCustomerRecord'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getParams = (ctx: any) => ({ id: String(ctx?.params?.id || '') })

export const GET = defineGetRoute<{ id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  getParams,
  handler: async (_req, { user, params }) => {
    const result = await getCustomerById({
      stationId: user.stationId,
      customerId: params.id,
    })
    return result instanceof Response ? result : ok(result)
  },
})

export const PATCH = defineMutationRoute<Record<string, any>, { id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  getParams,
  handler: async (_req, { user, body, params }) => {
    const result = await updateCustomerRecord({
      stationId: user.stationId,
      customerId: params.id,
      body,
    })
    return result instanceof Response ? result : ok(result)
  },
})

export const DELETE = defineMutationRoute<Record<string, any>, { id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  getParams,
  handler: async (_req, { body, params }) => {
    const result = await deleteOrRestoreCustomer({
      customerId: params.id,
      restore: Boolean(body?.restore),
    })
    return result instanceof Response ? result : ok(result)
  },
})
