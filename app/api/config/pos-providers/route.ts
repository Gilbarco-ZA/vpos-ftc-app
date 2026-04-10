import { ok } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  await requireAuth(['administrator'])
  return ok({
    options: [
      { value: 'DOMS', label: 'DOMS' },
      { value: 'PSS', label: 'PSS' },
    ],
  })
}
