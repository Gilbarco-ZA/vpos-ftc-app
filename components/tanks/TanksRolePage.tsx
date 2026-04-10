import { PageHeader } from '@/components/layout/page-header'
import TankConfigClient from '@/components/tanks/TankConfigClient'

export type TanksRole = 'manager' | 'administrator'

export const TanksRolePage = ({ role }: { role: TanksRole }) => {
  const isManager = role === 'manager'
  const title = isManager ? 'Tank management' : 'Tanks'
  const description = isManager
    ? 'Monitor assignments and inventory by tank.'
    : 'Configure tanks, grades, and station capacity.'

  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />
      <TankConfigClient mode={isManager ? 'manager' : 'admin'} />
    </div>
  )
}
