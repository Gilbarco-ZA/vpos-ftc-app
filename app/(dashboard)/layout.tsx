import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/src/shared/auth'
import { getBrandingSettings } from '@/src/shared/branding/settings'

import { MobileNav } from '@/components/layout/mobile-nav'
import { RuntimeNotifications } from '@/components/layout/RuntimeNotifications'
import { Sidebar } from '@/components/layout/sidebar'
import { StationConfigGuard } from '@/components/layout/StationConfigGuard'
import { Topbar } from '@/components/layout/topbar'
import { RuntimeImage } from '@/components/ui/runtime-image'

const hexToRgb = (value?: string | null) => {
  const hex = String(value ?? '')
    .trim()
    .replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

const foregroundForHex = (value?: string | null) => {
  const rgb = hexToRgb(value)
  if (!rgb) return '#ffffff'
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return yiq >= 150 ? '#111827' : '#ffffff'
}

const rgbaForHex = (value: string | null | undefined, alpha: number) => {
  const rgb = hexToRgb(value)
  if (!rgb) return undefined
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

const buildBrandStyle = (
  primary?: string | null,
  secondary?: string | null,
) => {
  const style: Record<string, string> = {}
  if (primary) {
    style['--brand-primary'] = primary
    style['--brand-primary-foreground'] = foregroundForHex(primary)
    style['--brand-accent'] = primary
    style['--neon-cyan'] = primary
    style['--neon-primary-foreground'] = foregroundForHex(primary)
    style['--border-neon-cyan'] = rgbaForHex(primary, 0.38) || primary
    style['--shadow-glow-cyan'] =
      `0 0 24px ${rgbaForHex(primary, 0.28) || primary}`
    style['--auth-accent-top'] = primary
    const focus = rgbaForHex(primary, 0.35)
    if (focus) style['--border-focus'] = focus
  }
  if (secondary) {
    style['--brand-secondary'] = secondary
    style['--brand-secondary-foreground'] = foregroundForHex(secondary)
    style['--neon-magenta'] = secondary
    style['--border-neon-magenta'] = rgbaForHex(secondary, 0.38) || secondary
    style['--shadow-glow-magenta'] =
      `0 0 24px ${rgbaForHex(secondary, 0.28) || secondary}`
    style['--auth-accent-bottom'] = secondary
  }
  return style
}

const DashboardLayout = async ({ children }: { children: ReactNode }) => {
  const user = await getCurrentUser()
  if (!user) return redirect('/login')

  const branding = await getBrandingSettings(user.stationId)

  const brandPrimary = (branding as any)?.primary_color || undefined
  const brandSecondary = (branding as any)?.secondary_color || undefined
  const stationDisplayName = (branding as any)?.station_display_name || null
  const brandLogoPath = (branding as any)?.logo_path || null
  const brandStyle = buildBrandStyle(brandPrimary, brandSecondary)

  return (
    <div
      className="min-h-screen bg-[var(--surface-page)]"
      style={brandStyle as any}
    >
      <div className="flex min-h-screen">
        <div className="no-print hidden xl:block">
          <Sidebar
            role={user.role}
            stationCountry={user.station.country}
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
                stationCountry={user.station.country}
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
                      <RuntimeImage
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
