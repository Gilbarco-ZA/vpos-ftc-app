import { PageHeader } from '@/components/layout/page-header'
import PumpStatusClient from '@/components/pumps/PumpStatusClient'

export type PumpsRole = 'manager' | 'administrator'

export const PumpsRolePage = ({
  role,
  stationId,
}: {
  role: PumpsRole
  stationId: string
}) => {
  const title = role === 'manager' ? 'Pump management' : 'Pumps'
  const description =
    role === 'manager'
      ? 'Monitor pump and nozzle status for your station.'
      : 'Review pump and nozzle status across the station.'

  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />
      <PumpStatusClient stationId={stationId} />
    </div>
  )
}
