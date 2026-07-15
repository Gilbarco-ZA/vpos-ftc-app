import { ok } from '@/src/platform/web/api/response'
import { listSetupCountryOptions } from '@/src/shared/server/config/countryDatasets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  return ok({ options: await listSetupCountryOptions() })
}
