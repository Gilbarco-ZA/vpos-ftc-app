import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/src/shared/auth'
import { getBrandingSettings } from '@/src/shared/branding/settings'

import { MobileNav } from '@/components/layout/mobile-nav'
import { RuntimeNotifications } from '@/components/layout/RuntimeNotifications'
import { Sidebar } from '@/components/layout/sidebar'
import { StationConfigGuard } from '@/components/layout/StationConfigGuard'
import { Topbar } from '@/components/layout/topbar'

const DashboardLayout = async ({ children }: { children: ReactNode }) => {
  const user = await getCurrentUser()
  if (!user) return redirect('/login')

  const branding = await getBrandingSettings(user.stationId)

  const brandPrimary = (branding as any)?.primary_color || undefined
  const brandSecondary = (branding as any)?.secondary_color || undefined
  const stationDisplayName = (branding as any)?.station_display_name || null
  const brandLogoPath = (branding as any)?.logo_path || null

  return (
    <div
      className="min-h-screen bg-[var(--surface-page)]"
      style={
        {
          ...(brandPrimary ? { ['--brand-primary' as any]: brandPrimary } : {}),
          ...(brandSecondary
            ? { ['--brand-secondary' as any]: brandSecondary }
            : {}),
        } as any
      }
    >
      <div className="flex min-h-screen">
        <div className="no-print hidden xl:block">
          <Sidebar
            role={user.role}
            branding={{
              stationDisplayName: stationDisplayName || user.station.name,
              logoPath: brandLogoPath,
            }}
          />
        </div>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar
            className="no-print sticky top-0 z-30"
            leading={
              <MobileNav
                role={user.role}
                branding={{
                  stationDisplayName: stationDisplayName || user.station.name,
                  logoPath: brandLogoPath,
                }}
              />
            }
            context={
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2">
                <div className="flex items-center gap-3">
                  {brandLogoPath ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)]">
                      <img
                        src={brandLogoPath}
                        alt={`${stationDisplayName || user.station.name} logo`}
                        className="h-5 w-5 object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Station
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {(stationDisplayName || user.station.name) as string}
                      </div>
                      <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        {user.station.code}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            }
          />
          <main className="flex-1 animate-fade-in">
            <div className="page-shell">{children}</div>
          </main>
        </div>
      </div>
      <StationConfigGuard />
      <RuntimeNotifications />
    </div>
  )
}

export default DashboardLayout
