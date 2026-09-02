import { EnergyOrb } from './energy-orb'

export type DashboardHeroStatus = {
  label: string
  value: string
  tone?: 'primary' | 'secondary' | 'success' | 'warning'
}

export type DashboardHeroProps = {
  stationName: string
  stationCode?: string | null
  tagline: string
  roleLabel?: string
  statuses?: DashboardHeroStatus[]
  logoPath?: string | null
}

const toneStyles: Record<NonNullable<DashboardHeroStatus['tone']>, string> = {
  primary:
    'border-[var(--border-neon-cyan)] text-[var(--neon-cyan)] shadow-[var(--shadow-glow-cyan)]',
  secondary:
    'border-[var(--border-neon-magenta)] text-[var(--neon-magenta)] shadow-[var(--shadow-glow-magenta)]',
  success:
    'border-[var(--border-neon-green)] text-[var(--neon-green)] shadow-[var(--shadow-glow-green)]',
  warning:
    'border-[var(--border-neon-amber)] text-[var(--neon-amber)] shadow-[var(--shadow-glow-amber)]',
}

export const DashboardHero = ({
  stationName,
  stationCode,
  tagline,
  roleLabel,
  statuses = [],
  logoPath,
}: DashboardHeroProps) => {
  return (
    <section className="glass-panel-elevated relative overflow-hidden rounded-2xl border-[var(--border-neon-cyan)] px-6 py-8 shadow-[var(--shadow-glow-cyan)] sm:px-8 lg:py-10">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(var(--border-neon-cyan)_1px,transparent_1px),linear-gradient(90deg,var(--border-neon-cyan)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="bg-[var(--neon-magenta)]/10 pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl" />
      <div className="bg-[var(--neon-cyan)]/10 pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full blur-3xl" />

      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border-neon-cyan)] bg-[color-mix(in_srgb,var(--neon-cyan)_10%,transparent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--neon-cyan)]">
              Live station console
            </span>
            {stationCode ? (
              <span className="bg-[var(--surface-card)]/70 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-muted)]">
                {stationCode}
              </span>
            ) : null}
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            <span className="bg-gradient-to-r from-[var(--neon-cyan)] via-[var(--text-primary)] to-[var(--neon-magenta)] bg-clip-text text-transparent">
              {stationName}
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
            {tagline}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {roleLabel ? (
              <div className="glass-panel rounded-lg border-[var(--border-neon-magenta)] px-4 py-2 text-sm text-[var(--neon-magenta)]">
                {roleLabel}
              </div>
            ) : null}
            {statuses.map((status) => (
              <div
                key={`${status.label}-${status.value}`}
                className={`glass-panel rounded-lg border px-4 py-2 ${toneStyles[status.tone ?? 'primary']}`}
              >
                <div className="text-[10px] uppercase tracking-[0.12em] opacity-75">
                  {status.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold">
                  {status.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden justify-self-end lg:block" aria-hidden>
          <EnergyOrb logoPath={logoPath} stationName={stationName} />
        </div>
      </div>
    </section>
  )
}
