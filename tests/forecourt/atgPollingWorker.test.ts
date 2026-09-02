import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { runAtgPollingWorkerLoop } from '@/src/modules/forecourt/infrastructure/atgPollingWorker'

test('ATG polling worker remains idle while disabled', async () => {
  let stopped = false
  let captures = 0
  let publications = 0
  const heartbeats: Array<Record<string, unknown>> = []
  let unlocked = false

  const result = await runAtgPollingWorkerLoop('station-1', {
    isStopped: () => stopped,
    settingsRefreshMs: 1_000,
    deps: {
      acquireLock: async () => ({
        release: async () => {
          unlocked = true
        },
      }),
      getSettings: async () => ({ enabled: false, intervalMinutes: 10 }),
      captureSnapshot: async () => {
        captures += 1
        throw new Error('should not capture while disabled')
      },
      publishSnapshot: async () => {
        publications += 1
      },
      heartbeat: async (value) => {
        heartbeats.push(value as unknown as Record<string, unknown>)
      },
      now: () => Date.parse('2026-08-07T12:00:00.000Z'),
      sleep: async () => {
        stopped = true
      },
    },
  })

  assert.deepEqual(result, { acquired: true })
  assert.equal(captures, 0)
  assert.equal(publications, 0)
  assert.equal(heartbeats[0]?.status, 'disabled')
  assert.equal(unlocked, true)
})

test('ATG polling worker captures once and schedules the configured interval', async () => {
  let stopped = false
  let captures = 0
  let publications = 0
  const heartbeats: Array<{
    status?: unknown
    metrics?: Record<string, unknown>
  }> = []
  const now = Date.parse('2026-08-07T12:00:00.000Z')

  await runAtgPollingWorkerLoop('station-1', {
    isStopped: () => stopped,
    settingsRefreshMs: 1_000,
    deps: {
      acquireLock: async () => ({ release: async () => {} }),
      getSettings: async () => ({ enabled: true, intervalMinutes: 10 }),
      captureSnapshot: async () => {
        captures += 1
        return {
          ok: true as const,
          recordedAt: '2026-08-07T12:00:00.000Z',
          requestedTgIds: ['01'],
          controllerErrors: [],
          updated: 1,
          snapshotsSaved: 1,
          tanks: [],
          liveData: {
            requestedTgIds: ['01'],
            responses: [],
            normalized: [],
            errors: [],
          },
        }
      },
      publishSnapshot: async (_stationId, result) => {
        publications += 1
        assert.equal(result.recordedAt, '2026-08-07T12:00:00.000Z')
        return { ok: true, tankCount: 1 }
      },
      heartbeat: async (value) => {
        heartbeats.push(
          value as unknown as {
            status?: unknown
            metrics?: Record<string, unknown>
          },
        )
      },
      now: () => now,
      sleep: async () => {
        stopped = true
      },
    },
  })

  assert.equal(captures, 1)
  assert.equal(publications, 1)
  assert.equal(heartbeats[0]?.status, 'OK')
  assert.equal(heartbeats[0]?.metrics?.intervalMinutes, 10)
  assert.equal(
    heartbeats[0]?.metrics?.nextPollAt,
    '2026-08-07T12:10:00.000Z',
  )
  assert.equal(heartbeats[0]?.metrics?.lastSnapshotsSaved, 1)
  assert.deepEqual(heartbeats[0]?.metrics?.publication, {
    ok: true,
    tankCount: 1,
  })
})

test('ATG storage keeps latest state plus bounded projection evidence', () => {
  const settingsMigration = readFileSync(
    'scripts/migrations/postgres/1274_atg_history_worker.sql',
    'utf8',
  )
  const snapshotMigration = readFileSync(
    'scripts/migrations/postgres/1275_atg_latest_snapshot.sql',
    'utf8',
  )
  const qualityMigration = readFileSync(
    'scripts/migrations/postgres/1277_atg_snapshot_quality.sql',
    'utf8',
  )
  const evidenceMigration = readFileSync(
    'scripts/migrations/postgres/1282_atg_transaction_projection_evidence.sql',
    'utf8',
  )
  const writer = readFileSync(
    'src/modules/forecourt/application/tankGauge.ts',
    'utf8',
  )
  const command = readFileSync(
    'src/modules/forecourt/application/captureAtgSnapshot.ts',
    'utf8',
  )

  assert.match(
    settingsMigration,
    /atg_polling_interval_seconds INTEGER NOT NULL DEFAULT 600/,
  )
  assert.match(snapshotMigration, /CREATE TABLE IF NOT EXISTS tank_atg_snapshots/)
  assert.match(snapshotMigration, /tank_id UUID PRIMARY KEY/)
  assert.match(snapshotMigration, /product_name TEXT/)
  assert.match(snapshotMigration, /tank_name TEXT/)
  assert.match(snapshotMigration, /capacity_litres NUMERIC/)
  assert.match(snapshotMigration, /temperature_c NUMERIC/)
  assert.match(snapshotMigration, /tc_volume_litres NUMERIC/)
  assert.match(snapshotMigration, /volume_litres NUMERIC/)
  assert.match(snapshotMigration, /tg_id VARCHAR\(2\) NOT NULL/)
  assert.match(snapshotMigration, /doms_tank_id VARCHAR\(2\)/)
  assert.match(snapshotMigration, /DROP TABLE IF EXISTS tank_atg_readings/)
  assert.match(qualityMigration, /gauge_online BOOLEAN/)
  assert.match(qualityMigration, /inventory_data_ready BOOLEAN/)
  assert.match(qualityMigration, /gauge_alarm_active BOOLEAN/)
  assert.match(qualityMigration, /gauge_error_active BOOLEAN/)
  assert.match(writer, /INSERT INTO tank_atg_snapshots/)
  assert.match(writer, /ON CONFLICT \(tank_id\) DO UPDATE SET/)
  assert.match(writer, /INSERT INTO tank_atg_capture_evidence/)
  assert.match(
    writer,
    /captured_at < NOW\(\) - INTERVAL '30 days'/,
  )
  assert.doesNotMatch(writer, /INSERT INTO tank_atg_readings/)
  assert.match(writer, /item\.tankAverageTempC/)
  assert.match(writer, /item\.tankGrossStdVol/)
  assert.match(writer, /item\.tankProductLevel/)
  assert.match(writer, /item\.tankWaterLevel/)
  assert.match(writer, /item\.tankAvailableRoom/)
  assert.match(writer, /item\.tankPressure/)
  assert.match(writer, /item\.gaugeOnline/)
  assert.match(writer, /item\.inventoryDataReady/)
  assert.match(writer, /positiveNumberOrNull\(item\.tankShellCapacity\)/)
  assert.match(writer, /positiveNumberOrNull\(item\.tankMaxSafeFillCapacity\)/)
  assert.match(command, /type: 'GET_ALL_TG_DATA'/)
  assert.match(command, /accessMode: 'forecourt'/)
  assert.match(evidenceMigration, /tank_atg_capture_evidence/)
  assert.match(evidenceMigration, /PRIMARY KEY \(tank_id, captured_at\)/)
})

test('ATG proxy publication failure does not increase the configured DOMS polling rate', async () => {
  let stopped = false
  const heartbeats: Array<{
    status?: unknown
    connected?: unknown
    metrics?: Record<string, unknown>
    lastError?: unknown
  }> = []
  const now = Date.parse('2026-08-07T12:00:00.000Z')

  await runAtgPollingWorkerLoop('station-1', {
    isStopped: () => stopped,
    settingsRefreshMs: 1_000,
    deps: {
      acquireLock: async () => ({ release: async () => {} }),
      getSettings: async () => ({ enabled: true, intervalMinutes: 10 }),
      captureSnapshot: async () => ({
        ok: true as const,
        recordedAt: '2026-08-07T12:00:00.000Z',
        requestedTgIds: ['01'],
        controllerErrors: [],
        updated: 1,
        snapshotsSaved: 1,
        tanks: [],
        liveData: {
          requestedTgIds: ['01'],
          responses: [],
          normalized: [],
          errors: [],
        },
      }),
      publishSnapshot: async () => {
        throw new Error('proxy unavailable')
      },
      heartbeat: async (value) => {
        heartbeats.push(value as (typeof heartbeats)[number])
      },
      now: () => now,
      sleep: async () => {
        stopped = true
      },
    },
  })

  assert.equal(heartbeats[0]?.status, 'degraded')
  assert.equal(heartbeats[0]?.connected, true)
  assert.equal(heartbeats[0]?.metrics?.phase, 'publish')
  assert.equal(
    heartbeats[0]?.metrics?.nextPollAt,
    '2026-08-07T12:10:00.000Z',
  )
  assert.match(String(heartbeats[0]?.lastError), /proxy unavailable/)
})
