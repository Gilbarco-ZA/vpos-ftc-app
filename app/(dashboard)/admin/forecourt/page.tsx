import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/src/shared/auth'
import { isTanzaniaCountry } from '@/src/shared/config/country'

import AdminForecourtClient from './client'

export default async function AdminForecourtPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <AdminForecourtClient
      isTanzania={isTanzaniaCountry(user.station?.country)}
    />
  )
}
