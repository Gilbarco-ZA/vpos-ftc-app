'use client'

export const EnergyOrb = () => {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow container */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Multiple glow layers for depth */}
        <div className="absolute h-48 w-48 rounded-full bg-[var(--neon-cyan)]/5 blur-3xl animate-pulse" />
        <div className="absolute h-40 w-40 rounded-full bg-[var(--neon-magenta)]/5 blur-2xl animate-pulse delay-1000" />
      </div>

      {/* Main orb */}
      <div className="relative h-32 w-32">
        {/* Rotating gradient border */}
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent"
          style={{
            borderImage: `linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta), var(--neon-cyan)) 1`,
            animation: 'spin 6s linear infinite',
          }}
        />

        {/* Inner gradient sphere */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--neon-cyan)]/30 via-[var(--neon-magenta)]/20 to-[var(--neon-cyan)]/10 animate-charging-orb" />

        {/* Center glow */}
        <div className="absolute inset-4 rounded-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-magenta)] blur-xl opacity-40" />

        {/* Pulsing inner dot */}
        <div className="absolute inset-6 rounded-full bg-[var(--neon-cyan)] opacity-60 animate-pulse shadow-[0_0_20px_rgba(0,245,255,0.6)]" />
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
