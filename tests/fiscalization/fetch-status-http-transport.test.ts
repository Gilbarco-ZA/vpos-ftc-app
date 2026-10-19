import assert from 'node:assert/strict'
import test from 'node:test'
import { createFetchStatusHttpTransport } from '@/src/modules/fiscalization/infrastructure/fetchStatusHttpTransport'
import { createSwaggerStatusLookupPort } from '@/src/modules/fiscalization/infrastructure/swaggerStatusLookupPort'

test('HTTP transport authenticates GET and encodes DocumentId without leaking key into URL', async () => {
  let url = ''
  let method: string | undefined
  let key: string | null = null
  const fakeFetch: typeof fetch = async (input, init) => {
    url = String(input)
    method = init?.method
    key = new Headers(init?.headers).get('x-api-key')
    return new Response(JSON.stringify({ error: false, invoices: [
      { documentId: 'A&B #1', status: 'FISCALIZED' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const transport = createFetchStatusHttpTransport(async () => ({
    baseUrl: 'http://127.0.0.1:5555/proxy/', apiKey: 'secret', timeoutMs: 3000,
  }), fakeFetch)
  const result = await createSwaggerStatusLookupPort(transport).lookup({
    countryCode: 'TZ', stationId: 'S1', documentId: 'A&B #1',
  })
  assert.equal(method, 'GET')
  assert.equal(key, 'secret')
  assert.equal(new URL(url).pathname, '/proxy/api/tanzania/invoices/status')
  assert.equal(new URL(url).searchParams.get('DocumentId'), 'A&B #1')
  assert.equal(url.includes('secret'), false)
  assert.equal(result.kind, 'response')
})

test('invalid credentials and base URL fail without dispatching a request', async () => {
  let called = false
  const fakeFetch: typeof fetch = async () => {
    called = true
    throw new Error('Unexpected network access')
  }
  const transport = createFetchStatusHttpTransport(async () => ({
    baseUrl: 'https://user:password@example.com', apiKey: '', timeoutMs: 3000,
  }), fakeFetch)
  const result = await createSwaggerStatusLookupPort(transport).lookup({
    countryCode: 'KE', stationId: 'S1', documentId: 'A',
  })
  assert.equal(result.kind, 'transport-error')
  assert.equal(called, false)
})

test('HTTP error cannot become fiscalized status even when response body claims success', async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ invoices: [{ documentId: 'A', status: 'FISCALIZED' }] }),
      { status: 503, headers: { 'content-type': 'application/json' } })
  const transport = createFetchStatusHttpTransport(async () => ({
    baseUrl: 'https://example.invalid', apiKey: 'key', timeoutMs: 1000,
  }), fakeFetch)
  const result = await createSwaggerStatusLookupPort(transport).lookup({
    countryCode: 'KE', stationId: 'S1', documentId: 'A',
  })
  assert.equal(result.kind, 'transport-error')
})
