import type { ReactNode } from 'react'

import { requireAuth } from '@/src/shared/auth'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireAuth(['administrator'])
  return children
}
