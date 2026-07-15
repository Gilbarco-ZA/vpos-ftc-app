'use client'

import type { BootstrapStatusPayload } from '@/src/modules/bootstrap/contracts/bootstrapStatus'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { PageSkeleton } from '@/components/ui/page-skeleton'

import LoginForm from './client'

export default function LoginGate() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        const response = await fetch('/api/bootstrap/status', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = (await response.json()) as BootstrapStatusPayload

        if (!response.ok) {
          throw new Error('Unable to determine application setup status')
        }
        if (payload.proxyReachable && !payload.isRegistered) {
          router.replace('/setup')
          return
        }
        if (Number(payload.userCount || 0) === 0) {
          router.replace('/setup')
          return
        }
        setReady(true)
      } catch (reason) {
        if (controller.signal.aborted) return
        setError(
          reason instanceof Error ? reason.message : 'Unable to load login',
        )
      }
    }

    void load()
    return () => controller.abort()
  }, [router])

  if (error) {
    return (
      <div className="rounded-lg border p-4 text-sm text-red-600">{error}</div>
    )
  }
  if (!ready) return <PageSkeleton rows={2} />
  return <LoginForm />
}
