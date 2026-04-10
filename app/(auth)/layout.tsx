import type { ReactNode } from 'react'

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface-page)] px-4 py-8 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at top left, var(--auth-accent-top), transparent 40%), radial-gradient(circle at bottom right, var(--auth-accent-bottom), transparent 40%)',
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(var(--auth-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--auth-grid-line) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-up">
        {children}
      </div>
    </div>
  )
}

export default AuthLayout
