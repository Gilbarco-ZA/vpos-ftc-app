import { ok } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  await requireAuth(['administrator'])
  return ok({
    options: [
      { value: 'none', label: 'None (DB-first)' },
      { value: 'jpl', label: 'JPL (DOMS POS Protocol)' },
      { value: 'ppx', label: 'PPX' },
      // { value: 'ligo', label: 'Ligo (stub)' },
      // { value: 'namos', label: 'Namos (stub)' },
    ],
  })
}
