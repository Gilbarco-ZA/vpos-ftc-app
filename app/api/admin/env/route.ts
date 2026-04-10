import {
  deleteEnvValue,
  listEnvValues,
  setEnvValue,
} from '@/src/platform/config/env-db'
import { fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    const rows = await listEnvValues(user.stationId)
    const env = rows.map((r) => ({
      name: String(r.key).replace(/^env:/, ''),
      value: r.value,
    }))
    return ok({ env })
  },
})

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const name = String(body.name || '').trim()
    if (!name) return fail('Missing name', 400)
    const value = String(body.value ?? '')
    await setEnvValue(user.stationId, name, value)
    return ok({ success: true })
  },
})

export const DELETE = defineMutationRoute<Record<string, any>>({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    const name = String(body.name || '').trim()
    if (!name) return fail('Missing name', 400)
    await deleteEnvValue(user.stationId, name)
    return ok({ success: true })
  },
})
