import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import {
  getStationCountryCode,
  isTanzaniaCountry,
} from '@/src/modules/tanzania-fiscal/application/country'

import { TanzaniaDailyTotalsClient } from '@/components/tanzania/TanzaniaDailyTotalsClient'

export const dynamic = 'force-dynamic'

const TanzaniaDailyTotalsPage = async () => {
  const user = await requireAuth(['manager', 'administrator'])
  if (!['manager', 'administrator'].includes(user.role)) redirect('/dashboard')

  const country = await getStationCountryCode(user.stationId)
  if (!isTanzaniaCountry(country)) redirect('/reports')

  return <TanzaniaDailyTotalsClient canManage={user.role === 'administrator'} />
}

export default TanzaniaDailyTotalsPage
