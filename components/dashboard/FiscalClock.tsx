'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

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

  const formatted = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return {
      date: `${byType.day}-${byType.month}-${byType.year}`,
      time: `${byType.hour}:${byType.minute}:${byType.second}`,
    }
  }, [now, timezone])

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-muted-foreground">Receipt & report time</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tracking-tight">{formatted.date}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatted.time}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Timezone: {timezone} · {source === 'site-profile' ? 'Site Profile override' : 'Device/runtime'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            This is the local time used for receipts, reports, and fiscal business-date calculations.
          </div>
        </div>
        <Link
          href="/admin/setup"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Adjust timezone
        </Link>
      </div>
    </div>
  )
}
