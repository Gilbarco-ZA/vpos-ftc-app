import { NextResponse } from 'next/server'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'
import { requireAuth } from '@/src/shared/auth'
import { getStationCountryCode } from '@/src/modules/tanzania-fiscal/application/country'
import {
  readKenyaSiteConfiguration, fetchAndSaveKenyaSiteConfiguration,
} from '@/src/modules/fiscalization/countries/kenya/siteConfiguration'

export const dynamic = 'force-dynamic'

async function authorize() {
  const user = await requireAuth(['administrator'])
  const country = await getStationCountryCode(user.stationId)
  if (country !== 'KE') throw new Error('Kenya fiscal configuration is available only for Kenya stations')
  return user.stationId
}

export async function GET() {
  try {
    const stationId = await authorize()
    return NextResponse.json({ ok: true, configuration: await readKenyaSiteConfiguration(stationId) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error instanceof Error ? error.message : error) }, { status: 403 })
  }
}

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const country = await getStationCountryCode(user.stationId)
    if (country !== 'KE') {
      return NextResponse.json({ ok: false, error: 'Kenya station is required' }, { status: 403 })
    }
    try {
      const configuration = await fetchAndSaveKenyaSiteConfiguration(user.stationId)
      return NextResponse.json({ ok: true, configuration })
    } catch (error) {
      return NextResponse.json({
        ok: false, error: error instanceof Error ? error.message : String(error),
      }, { status: 400 })
    }
  },
})
