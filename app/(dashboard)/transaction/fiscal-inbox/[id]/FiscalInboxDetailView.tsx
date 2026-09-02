import type { FiscalInboxDetailViewModel } from '@/src/modules/fiscal-inbox/presentation/view-models/fiscal-inbox.view-model'

import { DetailItem, DetailList } from '@/components/ui/detail-list'

function jsonStringifySafe(v: any) {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function formatDate(v: any) {
  return v ? new Date(v).toLocaleString() : ''
}

export function FiscalInboxDetailView({
  row,
}: {
  row: FiscalInboxDetailViewModel
}) {
  return (
    <>
      <div className="rounded border bg-[var(--surface-card)] p-4">
        <DetailList columns={3}>
          <DetailItem label="Topic">{row.topic}</DetailItem>
          <DetailItem label="Inbox status">{row.status}</DetailItem>
          <DetailItem label="Related transaction status">
            {row.related_transaction_status ?? ''}
          </DetailItem>
          <DetailItem label="Attempts">{row.attempt_count}</DetailItem>
          <DetailItem label="Request ID">
            <span className="font-mono text-xs">{row.request_id ?? ''}</span>
          </DetailItem>
          <DetailItem label="Related transaction ID">
            <span className="font-mono text-xs">
              {row.related_transaction_id ?? ''}
            </span>
          </DetailItem>
          <DetailItem label="Received">
            {formatDate(row.received_at)}
          </DetailItem>
          <DetailItem label="Next Attempt">
            {formatDate(row.next_attempt_at)}
          </DetailItem>
          <DetailItem label="Processed At">
            {formatDate(row.processed_at)}
          </DetailItem>
          <DetailItem label="Dead At">{formatDate(row.dead_at)}</DetailItem>
          <DetailItem label="Resolved At">
            {formatDate(row.resolved_at)}
          </DetailItem>
          <DetailItem label="Error">
            <span className="text-red-700">{row.error_text ?? ''}</span>
          </DetailItem>
        </DetailList>
      </div>

      <div className="rounded border bg-[var(--surface-card)] p-4">
        <div className="text-xs font-medium text-[var(--text-secondary)]">
          Message JSON
        </div>
        <pre className="mt-2 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
          {jsonStringifySafe(row.message_json)}
        </pre>
      </div>
    </>
  )
}
