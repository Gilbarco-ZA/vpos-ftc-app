import { requireAuth } from '@/src/shared/auth'
import { getBrandingSettings } from '@/src/shared/branding/settings'

import { RoleDashboardHome } from '@/components/dashboard/RoleDashboardHome'

export const dynamic = 'force-dynamic'

const DashboardHome = async () => {
  const user = await requireAuth()
  const branding = await getBrandingSettings(user.stationId)

  const role =
    user.role === 'administrator'
      ? 'administrator'
      : user.role === 'manager'
        ? 'manager'
        : 'tenant'

  return (
    <RoleDashboardHome
      role={role}
      stationName={user.station.name}
      stationCode={user.station.code}
      logoPath={(branding as any)?.logo_path ?? null}
    />
  )
}

export default DashboardHome
