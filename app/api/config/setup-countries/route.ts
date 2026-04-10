import { ok } from '@/src/platform/web/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  return ok({
    options: [
      { value: 'TZ', label: 'Tanzania (TZ)' },
      { value: 'KE', label: 'Kenya (KE)' },
    ],
  })
}
