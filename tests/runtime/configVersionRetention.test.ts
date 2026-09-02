import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  configJsonEquals,
  hashConfigJson,
  normalizeConfigJson,
} from '@/src/platform/config/config-version-policy'
import { buildConfigVersionRetentionTargets } from '@/src/platform/retention/configVersionRetention'
import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'

test('configuration hashes are deterministic across object key order', () => {
  const left = { b: 2, a: { z: true, y: [2, 1] } }
  const right = { a: { y: [2, 1], z: true }, b: 2 }

  assert.equal(normalizeConfigJson(left), normalizeConfigJson(right))
  assert.equal(hashConfigJson(left), hashConfigJson(right))
  assert.equal(hashConfigJson(left).length, 64)
  assert.equal(configJsonEquals(left, right), true)
  assert.equal(configJsonEquals(left, { ...right, b: 3 }), false)
})

test('configuration version retention keeps twenty versions by default', () => {
  const policy = getStorageRetentionPolicy({})
  assert.equal(policy.configVersionLimit, 20)
  assert.equal(policy.configVersionMinAgeDays, 7)
  assert.equal(policy.pssParsedCompatibilityDays, 30)
})

test('configuration version retention is owner-scoped and pin-aware', () => {
  const targets = buildConfigVersionRetentionTargets()
  assert.equal(targets.length, 3)

  const source = readFileSync(
    'src/platform/retention/configVersionRetention.ts',
    'utf8',
  )
  assert.match(source, /ROW_NUMBER\(\) OVER/)
  assert.match(source, /version_rank > \$2/)
  assert.match(source, /is_pinned, FALSE\) = FALSE/)
  assert.match(source, /FOR UPDATE OF \$\{target\.alias\} SKIP LOCKED/)
  assert.match(source, /policy\.configVersionLimit/)
  assert.match(source, /policy\.configVersionMinAgeDays/)

  assert.match(targets[0]?.partitionSql ?? '', /station_id/)
  assert.match(targets[1]?.partitionSql ?? '', /process_type/)
  assert.match(targets[1]?.partitionSql ?? '', /plugin_name/)
  assert.match(targets[2]?.partitionSql ?? '', /device_type/)
  assert.match(targets[2]?.partitionSql ?? '', /device_key/)
})

test('configuration writers suppress unchanged normalized versions', () => {
  const loader = readFileSync('src/platform/config/loader.ts', 'utf8')
  const pluginDevice = readFileSync(
    'src/platform/config/plugin-device.ts',
    'utf8',
  )
  const adminConfig = readFileSync(
    'src/modules/admin-config/infrastructure/adminConfigRepo.ts',
    'utf8',
  )
  const integrations = readFileSync(
    'src/modules/admin-integrations/infrastructure/adminIntegrationsRepo.ts',
    'utf8',
  )

  assert.match(loader, /configJsonEquals/)
  assert.match(loader, /config_hash/)
  assert.match(pluginDevice, /configJsonEquals/)
  assert.match(pluginDevice, /snapshotPluginConfigVersion/)
  assert.match(pluginDevice, /snapshotDeviceConfigVersion/)
  assert.match(adminConfig, /configJsonEquals/)
  assert.match(integrations, /configJsonEquals/)
})

test('Phase 5C migration adds pin and hash metadata without pruning history', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1265_pss_summary_config_version_retention.sql',
    'utf8',
  )

  assert.match(migration, /ADD COLUMN IF NOT EXISTS config_hash TEXT/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN/)
  assert.match(migration, /station_config_versions_retention_idx/)
  assert.match(migration, /plugin_config_versions_retention_idx/)
  assert.match(migration, /device_config_versions_retention_idx/)
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+(?:station|plugin|device)_config_versions/i)
})
