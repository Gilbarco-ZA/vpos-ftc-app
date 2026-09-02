import { DeviceStatusPanel } from '@/components/admin/device/DeviceStatusPanel'
import { DashboardSummary } from '@/components/dashboard/DashboardSummary'
import { DashboardHero } from '@/components/hero/dashboard-hero'

export type DashboardRole = 'tenant' | 'manager' | 'administrator'

type RoleConfig = {
  tagline: string
  summaryTitle: string
  roleLabel: string
}

const getRoleConfig = (role: DashboardRole): RoleConfig => {
  if (role === 'tenant') {
    return {
      tagline:
        'Fast access to station activity, receipts, and forecourt status.',
      summaryTitle: 'Activity Summary',
      roleLabel: 'Operator workspace',
    }
  }

  if (role === 'manager') {
    return {
      tagline: 'Monitor transactions, devices, and station performance.',
      summaryTitle: 'Activity Summary',
      roleLabel: 'Manager workspace',
    }
  }

  return {
    tagline: 'Complete operational, fiscal, and forecourt oversight.',
    summaryTitle: 'Activity Summary',
    roleLabel: 'Administrator workspace',
  }
}

export const RoleDashboardHome = ({
  role,
  stationName,
  stationCode,
  logoPath,
}: {
  role: DashboardRole
  stationName: string
  stationCode?: string | null
  logoPath?: string | null
}) => {
  const config = getRoleConfig(role)

  return (
    <div className="space-y-5">
      <DashboardHero
        stationName={stationName}
        stationCode={stationCode}
        logoPath={logoPath}
        tagline={config.tagline}
        roleLabel={config.roleLabel}
        statuses={[
          { label: 'Workspace', value: 'Ready', tone: 'success' },
          { label: 'Data range', value: 'Today', tone: 'primary' },
        ]}
      />

      <div className="glass-panel rounded-2xl p-1 shadow-card">
        <DashboardSummary title={config.summaryTitle} initialPreset="today" />
      </div>
      <div className="glass-panel rounded-2xl p-1 shadow-card">
        <DeviceStatusPanel />
      </div>
    </div>
  )
}
