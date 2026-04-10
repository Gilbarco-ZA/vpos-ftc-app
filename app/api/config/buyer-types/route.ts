import { ok } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  await requireAuth(['administrator', 'manager'])
  return ok({
    options: [
      { value: 'B2C', label: 'B2C' },
      { value: 'B2B', label: 'B2B' },
      { value: 'GOV', label: 'Government' },
      { value: 'OTHER', label: 'Other' },
    ],
  })
}
