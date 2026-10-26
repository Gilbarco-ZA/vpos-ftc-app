import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('proxy sender captures the prepared HTTP request body and failed response evidence', () => {
  const client = read('src/modules/transactions/infrastructure/fiscalization/proxyClient.ts')
  const sender = read('src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts')

  assert.match(client, /outboundPayload = stripNulls\(toCountrySpecificInvoicePayload\(invoice\)\)/)
  assert.match(client, /onPreparedPayload\?\.\(outboundPayload\)/)
  assert.match(client, /body: JSON\.stringify\(outboundPayload\)/)

  assert.match(sender, /onPreparedPayload: \(payload\) => \{/)
  assert.match(sender, /proxyRequestPayload = payload/)
  assert.match(sender, /proxyHttpResponse = \{ status: res\.status, body: res\.data \}/)
  assert.match(sender, /requestPayload: proxyRequestPayload/)
  assert.match(sender, /proxyResponse: proxyHttpResponse\.body/)
  assert.doesNotMatch(
    sender.slice(
      sender.indexOf('export async function sendClaimedTransactionToProxy'),
      sender.indexOf('export async function sendTransactionToProxyNow'),
    ),
    /requestPayload: invoice/,
  )
})

test('fiscal inbox proxy evidence is station/transaction-scoped and tied to a specific event', () => {
  const repository = read('src/modules/transactions/infrastructure/fiscalization/fiscalization-event.repository.ts')
  const query = read('src/modules/transactions/application/queries/get-proxy-fiscalization-exchange.ts')
  const route = read('app/api/runtime/fiscal/inbox/[id]/route.ts')

  assert.match(repository, /station_id::text = \$1::text/)
  assert.match(repository, /transaction_id::text = \$2::text/)
  assert.match(repository, /transport = 'proxy'/)
  assert.match(repository, /id::text = \$3::text/)
  assert.match(query, /normalizeFiscalPayload\(event\.request_payload\)/)
  assert.match(query, /normalizeFiscalPayload\(event\.response_payload\)/)
  assert.match(route, /roles: \['administrator'\]/)
  assert.match(route, /message\?\.fiscalEventId \?\? summary\?\.eventId/)
  assert.match(route, /detail\.related_transaction_id/)
  assert.match(route, /stationId: user\.stationId/)
})

test('fiscal inbox details show request and response without changing them', () => {
  const loader = read('app/(dashboard)/transaction/fiscal-inbox/[id]/FiscalInboxDetailLoader.tsx')
  const view = read('app/(dashboard)/transaction/fiscal-inbox/[id]/FiscalInboxDetailView.tsx')

  assert.match(loader, /proxyExchange: FiscalInboxProxyExchangeViewModel \| null/)
  assert.match(loader, /proxyExchange=\{data\.proxyExchange\}/)
  assert.match(view, /Outgoing proxy request payload/)
  assert.match(view, /Proxy response payload/)
  assert.match(view, /jsonStringifySafe\(proxyExchange\.requestPayload\)/)
  assert.match(view, /jsonStringifySafe\(proxyExchange\.responsePayload\)/)
  assert.match(view, /Latest recorded proxy attempt/)
  assert.match(view, /No matching proxy fiscalization event/)
})
