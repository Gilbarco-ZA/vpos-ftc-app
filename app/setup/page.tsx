import { redirect } from 'next/navigation'

import { queryOne } from '@/src/platform/db/postgres'
import { checkProxyDeviceStatus } from '@/src/shared/proxy/client'

import SetupWizard from './client'

export const dynamic = 'force-dynamic'

const SetupPage = async () => {
  // Check if device is already registered - if so, redirect to login
  const deviceStatus = await checkProxyDeviceStatus()
  const existingUser = await queryOne<{ count: number }>(
    `SELECT count(id) FROM users WHERE is_active = TRUE AND deleted_at IS NULL LIMIT 1`,
  )

  if (deviceStatus.isRegistered && Number(existingUser?.count || 0) > 0) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--surface-muted)]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-6">
        <div className="w-full max-w-2xl">
          <SetupWizard
            proxyReachable={deviceStatus.proxyReachable}
            initialError={deviceStatus.error}
            isRegistered={deviceStatus.isRegistered}
            proxyUrl={deviceStatus.proxyUrl}
          />
        </div>
      </div>
    </div>
  )
}

export default SetupPage
