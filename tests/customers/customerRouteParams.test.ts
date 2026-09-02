import assert from 'node:assert/strict'
import test from 'node:test'

import { readFrameworkRouteParams } from '../../src/platform/web/api/routeParams'

test('dynamic API route params resolve when Next supplies a Promise', async () => {
  const params = await readFrameworkRouteParams<{ id: string }>({
    params: Promise.resolve({ id: 'customer-123' }),
  })

  assert.deepEqual(params, { id: 'customer-123' })
})

test('dynamic API route params also resolve plain objects', async () => {
  const params = await readFrameworkRouteParams<{ id: string }>({
    params: { id: 'customer-456' },
  })

  assert.deepEqual(params, { id: 'customer-456' })
})
