import type {
  FiscalInboxDetailViewModel,
  FiscalInboxProxyExchangeViewModel,
} from '@/src/modules/fiscal-inbox/presentation/view-models/fiscal-inbox.view-model'

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
  proxyExchange,
}: {
  row: FiscalInboxDetailViewModel
  proxyExchange: FiscalInboxProxyExchangeViewModel | null
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

      <div className="space-y-3 rounded border bg-[var(--surface-card)] p-4">
        <h2 className="text-sm font-semibold">Proxy request and response</h2>
        {proxyExchange ? (
          <>
            <div className="space-y-1 text-xs text-[var(--text-secondary)]">
              <div>
                Event <span className="font-mono">{proxyExchange.eventId}</span>
                {' · '}Status: {proxyExchange.status}
                {' · '}Engine: {proxyExchange.engine}
                {' · '}Sent/recorded: {formatDate(proxyExchange.occurredAt)}
              </div>
              <div>
                {proxyExchange.matchType === 'inbox-event'
                  ? 'Matched to the fiscalization event referenced by this inbox message.'
                  : 'Latest recorded proxy attempt for the related transaction; not necessarily the attempt that generated this inbox message.'}
              </div>
              <div>
                Recorded diagnostic evidence is redacted for secrets. Historical
                requests may use the pre-transport invoice shape; new submissions
                capture the JSON body passed to the proxy HTTP request.
              </div>
            </div>
            <details open className="rounded border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Outgoing proxy request payload
              </summary>
              {proxyExchange.requestPayload == null ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  No request payload was recorded for this attempt.
                </p>
              ) : (
                <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-muted)] p-3 font-mono text-xs">
                  {jsonStringifySafe(proxyExchange.requestPayload)}
                </pre>
              )}
            </details>
            <details open className="rounded border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Proxy response payload
              </summary>
              {proxyExchange.responsePayload == null ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  No proxy response has been recorded for this attempt.
                </p>
              ) : (
                <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-muted)] p-3 font-mono text-xs">
                  {jsonStringifySafe(proxyExchange.responsePayload)}
                </pre>
              )}
            </details>
            {proxyExchange.errorMessage ? (
              <p className="break-words text-xs text-red-700">
                Recorded error: {proxyExchange.errorMessage}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">
            No matching proxy fiscalization event was found for this inbox
            message. The inbound Message JSON above remains available.
          </p>
        )}
      </div>
    </>
  )
}
