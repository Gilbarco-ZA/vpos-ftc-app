import { Suspense } from 'react'

import { PageSkeleton } from '@/components/ui/page-skeleton'

import StartupGate from './StartupGate'

export const dynamic = 'force-dynamic'

const StartupPage = () => (
  <Suspense fallback={<PageSkeleton rows={3} />}>
    <StartupGate />
  </Suspense>
)

export default StartupPage
