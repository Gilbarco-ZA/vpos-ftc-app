'use client'

import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type EventLogItem = {
  dateTime?: string
  status?: string
  statusCode?: string
  statusMessage?: string
  revenueAuthorityMessage?: string
}

type EventLogPanelProps = {
  events: EventLogItem[]
  loading?: boolean
  error?: unknown
  emptyMessage?: string
}

export const EventLogPanel = ({
  events,
  loading = false,
  error,
  emptyMessage = 'No events recorded yet.',
}: EventLogPanelProps) => {
  return (
    <div className="space-y-3 text-sm">
      {loading && (
        <div className="text-[var(--text-muted)]">Loading events…</div>
      )}
      {Boolean(error) && (
        <ErrorDetails
          title="We couldn’t load the event log right now."
          message="Check your connection and try again."
          error={error}
        />
      )}
      {!loading && !error && events.length === 0 && (
        <EmptyState title="No events yet" description={emptyMessage} />
      )}
      {!loading && !error && events.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Status code</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Authority message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event, index) => (
                <TableRow key={`${event.dateTime ?? 'event'}-${index}`}>
                  <TableCell className="text-[var(--text-secondary)]">
                    {event.dateTime ?? '—'}
                  </TableCell>
                  <TableCell>{event.status ?? '—'}</TableCell>
                  <TableCell>{event.statusCode ?? '—'}</TableCell>
                  <TableCell>{event.statusMessage ?? '—'}</TableCell>
                  <TableCell>{event.revenueAuthorityMessage ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default EventLogPanel
