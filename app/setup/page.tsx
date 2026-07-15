import SetupGate from './SetupGate'

export const dynamic = 'force-dynamic'

const SetupPage = () => (
  <div className="min-h-screen bg-[var(--surface-muted)]">
    <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-6">
      <div className="w-full max-w-2xl">
        <SetupGate />
      </div>
    </div>
  </div>
)

export default SetupPage
