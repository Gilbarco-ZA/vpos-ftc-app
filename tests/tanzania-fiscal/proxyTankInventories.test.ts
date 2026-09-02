import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildTanzaniaTankInventoriesRequest,
  publishLatestTanzaniaTankInventories,
} from '@/src/modules/tanzania-fiscal/infrastructure/proxyTankInventories'

test('builds the Tanzania tank inventory proxy contract from ATG snapshots', () => {
  const payload = buildTanzaniaTankInventoriesRequest([
    {
      product_name: 'PETROL',
      tank_name: 'PETROL TANK 1',
      capacity_litres: '57800',
      temperature_c: '31.8',
      tc_volume_litres: '42185',
      volume_litres: '42950',
      doms_tank_id: '01',
      tg_id: '01',
    },
    {
      product_name: 'DIESEL',
      tank_name: 'DIESEL TANK 1',
      capacity_litres: 45000,
      temperature_c: -2.4,
      tc_volume_litres: 19380.25,
      volume_litres: 19625.04,
      doms_tank_id: '4',
      tg_id: '04',
    },
  ])

  assert.deepEqual(payload, {
    data: [
      {
        product_name: 'PETROL',
        tank_name: 'PETROL TANK 1',
        capacity: '57800',
        Temperature: '+31.8',
        TC_Volume: '42185.0',
        Volume: '42950.0',
        Tank_ID: '1',
      },
      {
        product_name: 'DIESEL',
        tank_name: 'DIESEL TANK 1',
        capacity: '45000',
        Temperature: '-2.4',
        TC_Volume: '19380.25',
        Volume: '19625.04',
        Tank_ID: '4',
      },
    ],
  })
})

test('Tanzania ATG publishing is wired to the country-specific proxy endpoint', () => {
  const proxyClient = readFileSync(
    'src/modules/transactions/infrastructure/fiscalization/proxyClient.ts',
    'utf8',
  )
  const publisher = readFileSync(
    'src/modules/tanzania-fiscal/infrastructure/proxyTankInventories.ts',
    'utf8',
  )
  const runtime = readFileSync(
    'src/modules/runtime/infrastructure/inProcessRuntime.ts',
    'utf8',
  )

  assert.match(proxyClient, /\/api\/tanzania\/tank-inventories/)
  assert.match(publisher, /isTanzaniaCountry\(country\)/)
  assert.doesNotMatch(publisher, /EWURA_LC/)
  assert.match(publisher, /captured_at = \$2::timestamptz/)
  assert.match(publisher, /rows\.length !== expectedCount/)
  assert.match(runtime, /publishLatestTanzaniaTankInventories/)
})

test('skips Tanzania tank inventory publishing for non-Tanzania stations', async () => {
  let snapshotReads = 0
  let submissions = 0

  const result = await publishLatestTanzaniaTankInventories(
    'station-1',
    {
      recordedAt: '2026-08-07T12:00:00.000Z',
      requestedTgIds: ['01'],
      snapshotsSaved: 1,
    },
    {
      getCountry: async () => 'KE',
      loadSnapshots: async () => {
        snapshotReads += 1
        return []
      },
      submit: async () => {
        submissions += 1
        return { ok: true, status: 200, data: {} }
      },
    },
  )

  assert.deepEqual(result, {
    skipped: true,
    reason: 'station_country_not_tanzania',
  })
  assert.equal(snapshotReads, 0)
  assert.equal(submissions, 0)
})

test('publishes only a complete Tanzania ATG capture without FTC-owned identity fields', async () => {
  let submittedPayload: unknown = null
  let submittedIdempotencyKey = ''

  const result = await publishLatestTanzaniaTankInventories(
    'station-1',
    {
      recordedAt: '2026-08-07T12:00:00.000Z',
      requestedTgIds: ['01', '02'],
      snapshotsSaved: 2,
    },
    {
      getCountry: async () => 'TZ',
      loadSnapshots: async () => [
        {
          product_name: 'PETROL',
          tank_name: 'PETROL TANK 1',
          capacity_litres: '57800',
          temperature_c: '31.8',
          tc_volume_litres: '42185',
          volume_litres: '42950',
          doms_tank_id: '01',
          tg_id: '01',
        },
        {
          product_name: 'DIESEL',
          tank_name: 'DIESEL TANK 1',
          capacity_litres: '45000',
          temperature_c: '30.5',
          tc_volume_litres: '46790',
          volume_litres: '47325',
          doms_tank_id: '02',
          tg_id: '02',
        },
      ],
      submit: async (_stationId, payload, opts) => {
        submittedPayload = payload
        submittedIdempotencyKey = opts?.idempotencyKey ?? ''
        return { ok: true, status: 202, data: { queued: true } }
      },
    },
  )

  assert.deepEqual(result, { ok: true, tankCount: 2, queued: true })
  assert.deepEqual(submittedPayload, {
    data: [
      {
        product_name: 'PETROL',
        tank_name: 'PETROL TANK 1',
        capacity: '57800',
        Temperature: '+31.8',
        TC_Volume: '42185.0',
        Volume: '42950.0',
        Tank_ID: '1',
      },
      {
        product_name: 'DIESEL',
        tank_name: 'DIESEL TANK 1',
        capacity: '45000',
        Temperature: '+30.5',
        TC_Volume: '46790.0',
        Volume: '47325.0',
        Tank_ID: '2',
      },
    ],
  })
  assert.equal(
    submittedIdempotencyKey,
    'station-1:tanzania-tank-inventories:2026-08-07T12:00:00.000Z',
  )
})

test('rejects a partial current ATG set instead of mixing fresh and stale snapshots', async () => {
  await assert.rejects(
    () =>
      publishLatestTanzaniaTankInventories(
        'station-1',
        {
          recordedAt: '2026-08-07T12:00:00.000Z',
          requestedTgIds: ['01', '02'],
          snapshotsSaved: 1,
        },
        {
          getCountry: async () => 'TZ',
          loadSnapshots: async () => [
            {
              product_name: 'PETROL',
              tank_name: 'PETROL TANK 1',
              capacity_litres: '57800',
              temperature_c: '31.8',
              tc_volume_litres: '42185',
              volume_litres: '42950',
              doms_tank_id: '01',
              tg_id: '01',
            },
          ],
          submit: async () => {
            throw new Error('partial capture must not be submitted')
          },
        },
      ),
    /complete current snapshot: expected 2 tank\(s\), found 1/,
  )
})
