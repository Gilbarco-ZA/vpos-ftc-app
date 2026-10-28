import { redirect } from 'next/navigation'
import { requireAuth } from '@/src/shared/auth'
import { getStationCountryCode } from '@/src/modules/tanzania-fiscal/application/country'
import { KenyaFiscalSiteClient } from '@/components/kenya/KenyaFiscalSiteClient'

export const dynamic = 'force-dynamic'
export default async function KenyaFiscalPage() {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')
  if (await getStationCountryCode(user.stationId) !== 'KE') redirect('/dashboard')
  return <KenyaFiscalSiteClient />
}
