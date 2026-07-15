import { notFound } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import PumpDetailLoader from './loader'

export const dynamic = 'force-dynamic'

const SettingsPumpDetailPage = async (props: {
  params: Promise<{ id: string }>
}) => {
  const params = await props.params
  const user = await requireAuth(['administrator', 'manager'])
  const pumpId = String(params.id || '').trim()
  if (!pumpId) return notFound()

  return <PumpDetailLoader pumpId={pumpId} stationId={user.stationId} />
}

export default SettingsPumpDetailPage
