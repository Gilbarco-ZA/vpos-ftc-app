'use client'

import { RuntimeImage } from '@/components/ui/runtime-image'

type EnergyOrbProps = {
  logoPath?: string | null
  stationName?: string
}

export const EnergyOrb = ({ logoPath, stationName }: EnergyOrbProps) => {
  const normalizedLogo = String(logoPath ?? '').trim()

  if (normalizedLogo) {
    return (
      <div className="relative flex items-center justify-center">
        <div className="bg-[var(--neon-cyan)]/10 absolute h-48 w-48 animate-pulse rounded-full blur-3xl" />
        <div className="bg-[var(--neon-magenta)]/10 absolute h-40 w-40 rounded-full blur-2xl" />
        <div className="glass-panel-elevated relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-[var(--border-neon-cyan)] p-4 shadow-[var(--shadow-glow-cyan)]">
          <div className="from-[var(--neon-cyan)]/10 to-[var(--neon-magenta)]/10 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent" />
          {/* The configured brand asset can be an API-backed PNG/JPEG/SVG path. */}
          <RuntimeImage
            src={normalizedLogo}
            alt={`${stationName || 'Station'} logo`}
            className="relative z-10 max-h-full max-w-full object-contain"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-[var(--neon-cyan)]/5 absolute h-48 w-48 animate-pulse rounded-full blur-3xl" />
        <div className="bg-[var(--neon-magenta)]/5 absolute h-40 w-40 animate-pulse rounded-full blur-2xl delay-1000" />
      </div>

      <div className="relative h-32 w-32">
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent"
          style={{
            borderImage:
              'linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta), var(--neon-cyan)) 1',
            animation: 'spin 6s linear infinite',
          }}
        />
        <div className="animate-charging-orb from-[var(--neon-cyan)]/30 via-[var(--neon-magenta)]/20 to-[var(--neon-cyan)]/10 absolute inset-0 rounded-full bg-gradient-to-br" />
        <div className="absolute inset-4 rounded-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-magenta)] opacity-40 blur-xl" />
        <div className="absolute inset-6 animate-pulse rounded-full bg-[var(--neon-cyan)] opacity-60 shadow-[0_0_20px_rgba(0,245,255,0.6)]" />
      </div>

      <style jsx>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
