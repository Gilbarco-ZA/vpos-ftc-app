import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/src/shared/auth'
import { checkProxyDeviceStatus } from '@/src/shared/proxy/client'

const Home = async () => {
  // First check if device is registered
  const deviceStatus = await checkProxyDeviceStatus()
  if (!deviceStatus.isRegistered) {
    redirect('/setup')
  }

  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect('/dashboard')
}

export default Home
