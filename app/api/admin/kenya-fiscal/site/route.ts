import { NextResponse } from 'next/server'
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

export async function POST() {
  try {
    const stationId = await authorize()
    const configuration = await fetchAndSaveKenyaSiteConfiguration(stationId)
    return NextResponse.json({ ok: true, configuration })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error instanceof Error ? error.message : error) }, { status: 400 })
  }
}
