'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ErrorDetails } from '@/components/ui/error-details'
import { Skeleton } from '@/components/ui/skeleton'

import type { PumpDetail } from './types'
import PumpDetailClient from './client'

export default function PumpDetailLoader({
  pumpId,
  stationId,
}: {
  pumpId: string
  stationId: string
}) {
  const router = useRouter()
  const [pump, setPump] = useState<PumpDetail | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        const response = await fetch(`/api/settings/pumps/${pumpId}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (response.status === 404) {
          router.replace('/settings/pumps')
          return
        }
        const body = (await response.json().catch(() => ({}))) as {
          data?: PumpDetail
        }
        if (!response.ok || !body.data) throw body
        setPump(body.data)
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [pumpId, router])

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading pump settings">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !pump) {
    return (
      <ErrorDetails
        title="Unable to load pump settings"
        message="Check your connection and try again."
        error={error}
      />
    )
  }

  return <PumpDetailClient pump={pump} stationId={stationId} />
}
