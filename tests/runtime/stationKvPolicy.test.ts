import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  getStationKvKeyPolicy,
  getStationKvPolicyMode,
  prepareStationKvWrite,
} from '@/src/platform/config/station-kv-policy'

test('station KV policy defaults to compatibility and classifies owned keys', () => {
  assert.equal(getStationKvPolicyMode({}), 'compatibility')
  assert.equal(
    getStationKvPolicyMode({ VPOS_STATION_KV_POLICY_MODE: 'strict' }),
    'strict',
  )

  assert.equal(getStationKvKeyPolicy('env:JPL_TCP_HOST').owner, 'environment-override')
  assert.equal(getStationKvKeyPolicy('sync.cursor.push.transactions').owner, 'sync-cursor')
  assert.equal(getStationKvKeyPolicy('pss.xml.raw').owner, 'integration-config')
  assert.equal(getStationKvKeyPolicy('pss.xml.parsed').deprecated, true)
  assert.equal(
    getStationKvKeyPolicy('pss.xml.importSummary').owner,
    'integration-metadata',
  )
})

test('station KV writes validate key-specific value types', () => {
  assert.equal(
    prepareStationKvWrite('env:JPL_TCP_PORT', '8888').payload,
    '"8888"',
  )
  assert.throws(
    () => prepareStationKvWrite('env:JPL_TCP_PORT', 8888),
    /requires a string or null/,
  )
  assert.throws(
    () => prepareStationKvWrite('env:jpl_tcp_port', '8888'),
    /UPPER_SNAKE_CASE/,
  )

  assert.doesNotThrow(() =>
    prepareStationKvWrite('sync.cursor.push.transactions', {
      lastUpdatedAt: null,
      lastPk: null,
    }),
  )
  assert.throws(
    () =>
      prepareStationKvWrite('sync.cursor.push.transactions', {
        lastUpdatedAt: 123,
        lastPk: null,
      }),
    /invalid lastUpdatedAt/,
  )
})

test('unknown station KV keys are bounded and strict mode rejects them', () => {
  const compatible = prepareStationKvWrite('custom.compatibility.key', {
    ok: true,
  })
  assert.equal(compatible.policy.registered, false)
  assert.equal(compatible.policy.owner, 'unregistered')

  assert.throws(
    () =>
      prepareStationKvWrite(
        'custom.compatibility.key',
        { ok: true },
        { VPOS_STATION_KV_POLICY_MODE: 'strict' },
      ),
    /not registered to a configuration owner/,
  )

  assert.throws(
    () => prepareStationKvWrite('custom.compatibility.key', 'x'.repeat(20_000)),
    /exceeds its .*byte limit/,
  )
})

test('large PSS XML is allowed only within its explicit bound', () => {
  assert.doesNotThrow(() => prepareStationKvWrite('pss.xml.raw', '<x/>'))
  assert.throws(
    () => prepareStationKvWrite('pss.xml.raw', { xml: '<x/>' }),
    /requires a string or null/,
  )
})

test('all active station KV writers route through the policy boundary', () => {
  const stationKv = readFileSync('src/platform/config/station-kv.ts', 'utf8')
  const setupStorage = readFileSync('src/shared/setup/storage.ts', 'utf8')
  const proxyCollection = readFileSync('app/api/proxy-config/route.ts', 'utf8')
  const proxyItem = readFileSync('app/api/proxy-config/[key]/route.ts', 'utf8')
  const firstBoot = readFileSync('src/platform/bootstrap/first-boot.ts', 'utf8')

  assert.match(stationKv, /prepareStationKvWrite/)
  assert.match(setupStorage, /kvSet/)
  assert.doesNotMatch(setupStorage, /INSERT INTO station_kv/)
  assert.match(proxyCollection, /kvSet/)
  assert.doesNotMatch(proxyCollection, /INSERT INTO station_kv/)
  assert.match(proxyItem, /kvSet/)
  assert.doesNotMatch(proxyItem, /INSERT INTO station_kv/)
  assert.match(firstBoot, /prepareStationKvWrite/)
})

test('environment values use process environment before persisted station values', async () => {
  const { resolveEnvValueFromSources } = await import(
    '@/src/platform/config/env-db'
  )

  assert.equal(
    resolveEnvValueFromSources(
      'VPOS_PROXY_URL',
      'http://stored.example',
      'http://default.example',
      { VPOS_PROXY_URL: 'http://process.example' },
    ),
    'http://process.example',
  )
  assert.equal(
    resolveEnvValueFromSources(
      'VPOS_PROXY_URL',
      'http://stored.example',
      'http://default.example',
      {},
    ),
    'http://stored.example',
  )
  assert.equal(
    resolveEnvValueFromSources(
      'VPOS_PROXY_URL',
      null,
      'http://default.example',
      {},
    ),
    'http://default.example',
  )
})

test('Phase 5A migration is non-destructive and marks retirement candidates', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1263_configuration_ownership_guardrails.sql',
    'utf8',
  )

  assert.match(migration, /ALTER COLUMN key DROP NOT NULL/)
  assert.match(migration, /ck_station_kv_key_shape/)
  assert.match(migration, /ck_station_kv_value_size/)
  assert.match(migration, /COMMENT ON COLUMN station_kv\.value_json/)
  assert.match(migration, /COMMENT ON TABLE job_queue/)
  assert.doesNotMatch(migration, /DROP TABLE\s+job_queue/i)
  assert.doesNotMatch(migration, /DROP COLUMN\s+value_json/i)
})

test('retirement audit checks database rows and dependencies before drops', () => {
  const audit = readFileSync(
    'src/platform/config/audit/configStorageAudit.ts',
    'utf8',
  )

  assert.match(audit, /valueJsonMeaningfulRows/)
  assert.match(audit, /pg_views/)
  assert.match(audit, /pg_matviews/)
  assert.match(audit, /pg_get_functiondef/)
  assert.match(audit, /p\.prokind IN \('f', 'p'\)/)
  assert.match(audit, /pg_get_triggerdef/)
  assert.match(audit, /stationSettingsKeyPopulatedRows === 0/)
  assert.match(audit, /jobQueueTotal === 0/)
  assert.match(audit, /safeForDestructiveMigration/)
})


test('unused storage candidates have no active runtime readers or writers', () => {
  const roots = ['app', 'src', 'server', 'workers', 'scripts']
  const files: string[] = []
  const walk = (entry: string) => {
    for (const name of readdirSync(entry)) {
      const full = path.join(entry, name)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        if (
          full.includes(`${path.sep}migrations`) ||
          full.includes(`${path.sep}config${path.sep}audit`) ||
          full.includes(`${path.sep}config${path.sep}retirement`)
        ) {
          continue
        }
        walk(full)
      } else if (/\.(?:ts|tsx|js|cjs|mjs)$/.test(name)) {
        if (full.endsWith(`${path.sep}scripts${path.sep}retire-config-storage.ts`)) {
          continue
        }
        files.push(full)
      }
    }
  }
  roots.forEach((root) => walk(root))

  const jobQueueReferences = files.filter((file) =>
    /\bjob_queue\b/.test(readFileSync(file, 'utf8')),
  )
  const valueJsonReferences = files.filter((file) =>
    /\bvalue_json\b/.test(readFileSync(file, 'utf8')),
  )
  const legacySettingsWrites = files.filter((file) =>
    /INSERT INTO station_settings[\s\S]{0,240}\bkey\b/i.test(
      readFileSync(file, 'utf8'),
    ),
  )

  assert.deepEqual(jobQueueReferences, [])
  assert.deepEqual(valueJsonReferences, [])
  assert.deepEqual(legacySettingsWrites, [])
})
