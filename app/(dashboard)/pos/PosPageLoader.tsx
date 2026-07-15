'use client'

import type { PosCatalogResponse } from '@/src/modules/pos/contracts/catalog'
import { useEffect, useState } from 'react'

import ProvisionalPosPageClient from '@/components/pos/ProvisionalPosPageClient'
import { Alert } from '@/components/ui/alert'
import { PageSkeleton } from '@/components/ui/page-skeleton'

const parseError = async (response: Response) => {
  const payload = await response.json().catch(() => null)
  return String(
    payload?.error?.message || payload?.message || 'Failed to load POS catalog',
  )
}

export default function PosPageLoader() {
  const [catalog, setCatalog] = useState<PosCatalogResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadCatalog = async () => {
      try {
        const response = await fetch('/api/pos/catalog', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(await parseError(response))

        const payload = await response.json()
        if (!controller.signal.aborted) setCatalog(payload.data)
      } catch (caught) {
        if (controller.signal.aborted) return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Failed to load POS catalog',
        )
      }
    }

    void loadCatalog()
    return () => controller.abort()
  }, [])

  if (error) return <Alert variant="error">{error}</Alert>
  if (!catalog) return <PageSkeleton rows={5} />

  return <ProvisionalPosPageClient {...catalog} />
}
