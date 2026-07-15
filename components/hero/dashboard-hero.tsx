'use client'

import { EnergyOrb } from './energy-orb'

export type DashboardHeroProps = {
  stationName?: string
  tagline?: string
}

export const DashboardHero = ({
  stationName = 'Neo-Fuel Station',
  tagline = 'Refueling Innovation',
}: DashboardHeroProps) => {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border-neon-cyan)] bg-gradient-to-b from-[var(--surface-elevated)]/50 to-[var(--surface-card)]/50 px-6 py-12 sm:px-8 sm:py-16 md:py-20">
      {/* Background animated grid/particles effect */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,var(--neon-cyan)/10_1px,transparent_1px,transparent_40px,var(--neon-cyan)/10_41px,var(--neon-cyan)/10_42px,transparent_42px,transparent_80px)] bg-[length:80px_80px]" />
        <div className="absolute inset-0 animate-particle-float">
          <div className="absolute left-1/4 top-1/4 h-2 w-2 rounded-full bg-[var(--neon-cyan)] opacity-40" />
        </div>
      </div>

      {/* Content wrapper */}
      <div className="relative flex flex-col items-center gap-8 md:gap-12">
        {/* Animated energy orb */}
        <div className="mb-4 flex justify-center">
          <EnergyOrb />
        </div>

        {/* Text content */}
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold sm:text-5xl md:text-6xl">
            <span className="bg-gradient-to-r from-[var(--neon-cyan)] via-[var(--neon-magenta)] to-[var(--neon-cyan)] bg-clip-text text-transparent animate-gradient-shift">
              {stationName}
            </span>
          </h1>
          <p className="mb-2 text-xl font-light tracking-wide text-[var(--neon-green)] animate-glow-pulse sm:text-2xl">
            {tagline}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-neon-cyan)] bg-[var(--surface-card)]/50 px-4 py-2 text-sm text-[var(--neon-cyan)] backdrop-blur-sm">
              <div className="h-2 w-2 rounded-full bg-[var(--neon-cyan)] animate-pulse" />
              <span>System Online</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-neon-green)] bg-[var(--surface-card)]/50 px-4 py-2 text-sm text-[var(--neon-green)] backdrop-blur-sm">
              <div className="h-2 w-2 rounded-full bg-[var(--neon-green)] animate-pulse" />
              <span>All Services</span>
            </div>
          </div>
        </div>

        {/* Divider line with glow */}
        <div className="relative w-32 border-t border-[var(--border-neon-magenta)] shadow-[0_0_10px_rgba(195,0,255,0.2)]" />

        {/* Quick stats or status indicators */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Pumps Active', value: '12', color: 'neon-cyan' },
            { label: 'Fuel Grade', value: 'Multiple', color: 'neon-green' },
            { label: 'Status', value: 'Optimal', color: 'neon-amber' },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center gap-1 rounded-lg border border-[var(--neon-${stat.color === 'neon-cyan' ? 'cyan' : stat.color === 'neon-green' ? 'green' : 'amber'})] bg-[var(--surface-card)]/50 px-6 py-4 text-center backdrop-blur-sm`}
            >
              <div className={`text-${stat.color === 'neon-cyan' ? '[var(--neon-cyan)]' : stat.color === 'neon-green' ? '[var(--neon-green)]' : '[var(--neon-amber)]'} font-semibold`}>
                {stat.value}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Glow effects corners */}
      <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 bg-[var(--neon-cyan)]/5 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 bg-[var(--neon-magenta)]/5 blur-3xl" />
    </section>
  )
}
