import { redirect } from 'next/navigation'

import { queryOne } from '@/src/platform/db/postgres'
import { checkProxyDeviceStatus } from '@/src/shared/proxy/client'

import LoginForm from './client'

export const dynamic = 'force-dynamic'

const LoginPage = async () => {
  const deviceStatus = await checkProxyDeviceStatus()

  if (deviceStatus.proxyReachable && !deviceStatus.isRegistered) {
    redirect('/setup')
  }

  const existingUser = await queryOne<{ count: string }>(
    `SELECT COUNT(1)::text AS count FROM users WHERE is_active = TRUE AND deleted_at IS NULL`,
  )
  if (Number(existingUser?.count || 0) === 0) {
    redirect('/setup')
  }

  return <LoginForm />
}

export default LoginPage
