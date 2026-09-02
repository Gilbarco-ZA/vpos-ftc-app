'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function DeferredForecourtPanel({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  if (mounted) return children

  return (
    <Card>
      <CardContent className="flex min-h-36 flex-col items-start justify-center gap-3 p-4">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {label}
          </div>
          <div className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            This diagnostic section is loaded on demand to protect the station
            database and forecourt runtime from dashboard query bursts.
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => setMounted(true)}>
          Load {label}
        </Button>
      </CardContent>
    </Card>
  )
}
