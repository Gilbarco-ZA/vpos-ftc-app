import { useCallback, useEffect, useState } from 'react'

import { Button } from '../ui/button'
import EventLogPanel from '../ui/event-log-panel'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet'

/**
 * Generic event-log loader hook.
 * - `entity` can be Product, Customer, Order, etc. as long as it has an `id`.
 * - `buildUrl` lets you point to any endpoint.
 */
export function useEventLog<T extends { id: string }, E>(
  entity: T | null,
  buildUrl: (id: string) => string,
  options?: {
    /** Optional custom sort (defaults to dateTime desc by string compare) */
    sort?: (events: E[]) => E[]
    /** Auto fetch when `entity` becomes non-null (default true) */
    auto?: boolean
  },
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [events, setEvents] = useState<E[]>([])

  const sortEvents = options?.sort
  const auto = options?.auto ?? true

  const fetchEvents = useCallback(async () => {
    if (!entity) return
    setLoading(true)
    setError(null)
    setEvents([])

    try {
      const res = await fetch(buildUrl(entity.id), { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError({ status: res.status, body })
        return
      }

      // supports either `{ data: { events: [] } }`, `{ events: [] }`, or direct `[]`
      const data = (body as any)?.data ?? body
      const list = Array.isArray(data?.events)
        ? data.events
        : Array.isArray(data)
          ? data
          : []

      const sorted = sortEvents
        ? sortEvents(list)
        : [...list].sort((a: any, b: any) =>
            String(b?.dateTime ?? '').localeCompare(String(a?.dateTime ?? '')),
          )
      setEvents(sorted)
    } catch (err: unknown) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [entity, buildUrl, sortEvents])

  useEffect(() => {
    if (!auto || !entity) return
    queueMicrotask(() => {
      fetchEvents()
    })
  }, [auto, entity, fetchEvents])

  return { events, loading, error, fetchEvents, setEvents }
}

type EventLogSheetProps<T extends { id: string }, E> = {
  /** Controls open state; when null/undefined, sheet is closed */
  entity: T | null
  onClose: () => void

  /** Endpoint builder for event log */
  buildUrl: (id: string) => string

  /** UI customization */
  title?: string
  emptyMessage?: string

  /** Optional custom sort */
  sort?: (events: E[]) => E[]
}

export function EventLogSheet<T extends { id: string }, E>({
  entity,
  onClose,
  buildUrl,
  title = 'Event log',
  emptyMessage = 'No events recorded.',
  sort,
}: EventLogSheetProps<T, E>) {
  const { events, loading, error, fetchEvents } = useEventLog<T, E>(
    entity,
    buildUrl,
    {
      sort,
    },
  )

  return (
    <Sheet open={Boolean(entity)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <EventLogPanel
            events={events as any}
            loading={loading}
            error={error}
            emptyMessage={emptyMessage}
          />

          <SheetFooter className="mt-4">
            <Button variant="secondary" onClick={fetchEvents}>
              Retry
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
