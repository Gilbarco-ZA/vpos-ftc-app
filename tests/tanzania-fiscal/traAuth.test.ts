import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTraTokenRequestBody,
  clearTraTokenCacheForTests,
  requestTraBearerToken,
  resolveTraTokenEndpoint,
} from '../../src/modules/tanzania-fiscal/infrastructure/traAuth'

test('resolves TRA token endpoints with package-compatible vfdtoken path', () => {
  assert.equal(
    resolveTraTokenEndpoint('https://tra.example.test'),
    'https://tra.example.test/vfdtoken',
  )
  assert.equal(
    resolveTraTokenEndpoint('https://tra.example.test/api/efdmsRctInfo'),
    'https://tra.example.test/vfdtoken',
  )
  assert.equal(
    resolveTraTokenEndpoint('https://tra.example.test/vfdtoken'),
    'https://tra.example.test/vfdtoken',
  )
})

test('builds the TRA token request as form-urlencoded password grant data', () => {
  const body = buildTraTokenRequestBody({
    username: 'tax-user',
    password: 'secret pass',
  })
  const params = new URLSearchParams(body)

  assert.equal(params.get('username'), 'tax-user')
  assert.equal(params.get('password'), 'secret pass')
  assert.equal(params.get('grant_type'), 'password')
})

test('requests TRA bearer token and preserves ack headers in audit payload', async () => {
  clearTraTokenCacheForTests()
  const calls: Array<{ input: string; body: string | null }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      input: String(input),
      body: init?.body == null ? null : String(init.body),
    })
    return new Response(
      JSON.stringify({ access_token: 'token-one', expires_in: '3600' }),
      {
        status: 200,
        headers: {
          ackcode: '7',
          ackmsg: 'Token issued',
          'content-type': 'application/json',
        },
      },
    )
  }

  const result = await requestTraBearerToken({
    stationId: 'station-1',
    baseUrl: 'https://tra.example.test/api/efdmsRctInfo',
    username: 'tax-user',
    password: 'secret-pass',
    fetchImpl,
  })

  assert.equal(result.ok, true)
  assert.equal(result.token, 'token-one')
  assert.equal(result.fromCache, false)
  assert.equal(result.endpoint, 'https://tra.example.test/vfdtoken')
  assert.equal(result.response.ackcode, '7')
  assert.equal(result.response.ackmsg, 'Token issued')
  assert.equal(result.request?.body.password, '***')
  assert.equal(calls.length, 1)
  assert.match(calls[0]!.body ?? '', /grant_type=password/)
})

test('reuses a valid cached TRA token when refresh is blocked by ackcode', async () => {
  clearTraTokenCacheForTests()
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    if (calls === 1) {
      return new Response(
        JSON.stringify({ access_token: 'cached-token', expires_in: '3600' }),
        {
          status: 200,
          headers: { ackcode: '7', ackmsg: 'Token issued' },
        },
      )
    }

    return new Response(JSON.stringify({ message: 'blocked' }), {
      status: 200,
      headers: { ackcode: '18', ackmsg: 'Token request blocked' },
    })
  }

  await requestTraBearerToken({
    stationId: 'station-1',
    baseUrl: 'https://tra.example.test',
    username: 'tax-user',
    password: 'secret-pass',
    fetchImpl,
  })

  const cachedResult = await requestTraBearerToken({
    stationId: 'station-1',
    baseUrl: 'https://tra.example.test',
    username: 'tax-user',
    password: 'secret-pass',
    forceRefresh: true,
    fetchImpl,
  })

  assert.equal(cachedResult.ok, true)
  assert.equal(cachedResult.token, 'cached-token')
  assert.equal(cachedResult.fromCache, true)
  assert.equal(cachedResult.response.ackcode, '18')
  assert.match(cachedResult.error ?? '', /using cached token/i)
  assert.equal(calls, 2)
})
