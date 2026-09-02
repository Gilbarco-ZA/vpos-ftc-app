import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { runAtgHistoryWorkerLoop } from '@/src/modules/forecourt/infrastructure/atgHistoryWorker'

test('legacy ATG history worker alias uses latest-snapshot worker semantics', async () => {
  let stopped = false
  let captures = 0
  let publications = 0
  const heartbeats: Array<{
    status?: unknown
    metrics?: Record<string, unknown>
  }> = []
  const now = Date.parse('2026-08-07T12:00:00.000Z')

  await runAtgHistoryWorkerLoop('station-1', {
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

test('legacy ATG path keeps latest state plus bounded projection evidence', () => {
  const settingsMigration = readFileSync(
    'scripts/migrations/postgres/1274_atg_history_worker.sql',
    'utf8',
  )
  const snapshotMigration = readFileSync(
    'scripts/migrations/postgres/1275_atg_latest_snapshot.sql',
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
  assert.match(writer, /INSERT INTO tank_atg_snapshots/)
  assert.match(writer, /ON CONFLICT \(tank_id\) DO UPDATE SET/)
  assert.match(writer, /INSERT INTO tank_atg_capture_evidence/)
  assert.doesNotMatch(writer, /INSERT INTO tank_atg_readings/)
  assert.match(command, /type: 'GET_ALL_TG_DATA'/)
  assert.match(command, /accessMode: 'forecourt'/)
  assert.match(evidenceMigration, /tank_atg_capture_evidence/)
})
