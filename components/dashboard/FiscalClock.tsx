'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { localDateTime } from '@/src/shared/time/localDateTime'

export function FiscalClock({
  timezone,
  source,
}: {
  timezone: string
  source: 'site-profile' | 'device-runtime'
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const formatted = useMemo(() => localDateTime(now, timezone), [now, timezone])

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-muted-foreground text-sm font-medium">
            Receipt & report time
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tracking-tight">
              {formatted.displayDate}
            </span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatted.time}
            </span>
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            Timezone: {timezone} ·{' '}
            {source === 'site-profile'
              ? 'Site Profile override'
              : 'Device/runtime'}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            This is the local time used for receipts, reports, and fiscal
            business-date calculations.
          </div>
        </div>
        <Link
          href="/admin/setup"
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Adjust timezone
        </Link>
      </div>
    </div>
  )
}
