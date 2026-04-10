import type { ReactNode } from 'react'

import { DeviceStatusPanel } from '@/components/admin/device/DeviceStatusPanel'
import { DashboardSummary } from '@/components/dashboard/DashboardSummary'
import { PageHeader } from '@/components/layout/page-header'

export type DashboardRole = 'tenant' | 'manager' | 'administrator'

type RoleConfig = {
  title: string
  description: string
  summaryTitle: string
  eyebrow?: string
  actions?: ReactNode
}

const getRoleConfig = (role: DashboardRole): RoleConfig => {
  if (role === 'tenant') {
    return {
      title: 'Dashboard',
      description: 'Overview of your station activity and device status.',
      summaryTitle: 'Activity Summary',
      eyebrow: 'Overview',
    }
  }

  if (role === 'manager') {
    return {
      title: 'Dashboard',
      description: 'Monitor transactions, devices, and station performance.',
      summaryTitle: 'Activity Summary',
      eyebrow: 'Manager View',
    }
  }

  return {
    title: 'Dashboard',
    description: 'Complete overview of station operations and system status.',
    summaryTitle: 'Activity Summary',
    eyebrow: 'Administrator',
  }
}

export const RoleDashboardHome = ({ role }: { role: DashboardRole }) => {
  const config = getRoleConfig(role)

  return (
    <div className="space-y-5">
      <PageHeader
        title={config.title}
        description={config.description}
        eyebrow={config.eyebrow}
        actions={config.actions}
      />

      <DashboardSummary title={config.summaryTitle} initialPreset="today" />
      <DeviceStatusPanel />
    </div>
  )
}
