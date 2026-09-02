'use client'

import type { BootstrapStatusPayload } from '@/src/modules/bootstrap/contracts/bootstrapStatus'
import type { StartupStatus } from '@/src/platform/bootstrap/startup-status'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { PageSkeleton } from '@/components/ui/page-skeleton'

import SetupWizard from './client'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: BootstrapStatusPayload }

export default function SetupGate() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        const startupResponse = await fetch('/api/startup/status', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const startupPayload = await startupResponse.json()
        if (!startupResponse.ok) {
          throw new Error('Unable to load startup status')
        }

        const startup = startupPayload.data as StartupStatus
        if (startup.phase !== 'ready' && startup.phase !== 'degraded') {
          router.replace('/startup?next=/setup')
          return
        }

        const response = await fetch('/api/bootstrap/status', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = (await response.json()) as BootstrapStatusPayload
        if (!response.ok) throw new Error('Unable to load setup status')

        if (
          payload.isRegistered &&
          Number(payload.userCount || 0) > 0 &&
          !Boolean(payload.canManageSetup)
        ) {
          router.replace('/login')
          return
        }
        setState({ status: 'ready', payload })
      } catch (reason) {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message:
            reason instanceof Error ? reason.message : 'Unable to load setup',
        })
      }
    }

    void load()
    return () => controller.abort()
  }, [router])

  if (state.status === 'loading') return <PageSkeleton rows={4} />
  if (state.status === 'error') {
    return (
      <div className="rounded-lg border p-4 text-sm text-red-600">
        {state.message}
      </div>
    )
  }

  return (
    <SetupWizard
      proxyReachable={state.payload.proxyReachable}
      initialError={state.payload.proxyError}
      isRegistered={state.payload.isRegistered}
      proxyUrl={state.payload.proxyUrl}
      proxyCountryCode={String(state.payload.proxyCountryCode || '')}
      stationCountry={String(state.payload.stationCountry || '')}
    />
  )
}
