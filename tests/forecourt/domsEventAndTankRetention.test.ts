import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  classifyForecourtEvent,
  prepareForecourtEventStorage,
} from '@/src/modules/forecourt/domain/forecourtEventRetention'
import { buildTankGaugeDiagnostics } from '@/src/modules/forecourt/domain/tankGaugeDiagnostics'

test('forecourt events are classified by operational retention value', () => {
  assert.equal(
    classifyForecourtEvent({
      source: 'jpl_tcp',
      eventType: 'FpStatus_resp_01',
      payload: { FpId: 1, FpMainState: 'IDLE' },
    }),
    'routine',
  )
  assert.equal(
    classifyForecourtEvent({
      source: 'jpl_tcp',
      eventType: 'critical_alarm',
      payload: { status: 'FAILED' },
    }),
    'error',
  )
  assert.equal(
    classifyForecourtEvent({
      source: 'admin',
      eventType: 'doms.maintenance_session_approved',
      payload: {},
    }),
    'maintenance_security',
  )
  assert.equal(
    classifyForecourtEvent({
      source: 'jpl_tcp',
      eventType: 'FcInstallStatus_resp_00H',
      payload: {},
    }),
    'field_evidence',
  )
})

test('routine event storage keeps compact identifiers and drops raw bodies', () => {
  const prepared = prepareForecourtEventStorage({
    source: 'jpl_tcp',
    eventType: 'FpStatus_resp_01',
    payload: {
      FpId: 1,
      FpMainState: 'IDLE',
      action: 'status',
      token: 'do-not-store',
      message: 'Authorization: Bearer do-not-store-either',
      rawFrame: 'x'.repeat(10_000),
      nested: { large: 'payload' },
    },
  })

  assert.equal(prepared.retentionClass, 'routine')
  assert.equal(prepared.payload.pumpId, 1)
  assert.equal(prepared.payload.action, 'status')
  assert.equal(prepared.payload.FpMainState, 'IDLE')
  assert.equal('token' in prepared.payload, false)
  assert.equal(prepared.payload.message, '[redacted sensitive value]')
  assert.equal('rawFrame' in prepared.payload, false)
  assert.match(prepared.payloadHash, /^[0-9a-f]{64}$/)
})

test('field evidence is bounded and sensitive keys are redacted', () => {
  const prepared = prepareForecourtEventStorage({
    source: 'admin',
    eventType: 'doms.field_validation_evidence_imported',
    payload: {
      station: 'A',
      authorizationToken: 'secret',
      evidence: Array.from({ length: 80 }, (_, index) => ({ index })),
    },
  })

  assert.equal(prepared.retentionClass, 'field_evidence')
  assert.equal(prepared.payload.authorizationToken, '[redacted]')
  assert.ok(Array.isArray(prepared.payload.evidence))
  assert.ok((prepared.payload.evidence as unknown[]).length <= 51)
})

test('tank diagnostics retain normalized values and a source hash only', () => {
  const diagnostics = buildTankGaugeDiagnostics({
    tgId: '01',
    capturedAt: '2026-07-21T10:00:00.000Z',
    liveVolumeLitres: 12_345,
    waterVolumeLitres: 20,
    averageTemperatureC: 24.5,
    sourcePayload: {
      TgId: '01',
      certificate: 'must-not-be-copied',
      raw: 'large-source-payload',
    },
  })

  assert.equal(diagnostics.tgId, '01')
  assert.equal(diagnostics.liveVolumeLitres, 12_345)
  assert.equal(diagnostics.waterVolumeLitres, 20)
  assert.match(diagnostics.sourcePayloadHash, /^[0-9a-f]{64}$/)
  assert.equal('sourcePayload' in diagnostics, false)
})

test('phase 4B migration and writers preserve bounded compatibility', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1261_forecourt_event_tank_retention.sql',
    'utf8',
  )
  const persistence = readFileSync(
    'src/modules/forecourt/infrastructure/persistence.ts',
    'utf8',
  )
  const tankWriter = readFileSync('src/modules/forecourt/application/tankGauge.ts', 'utf8')
  const normalizedTransactionWriter = readFileSync(
    'src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionsRepo.ts',
    'utf8',
  )
  const compaction = readFileSync(
    'src/platform/retention/forecourtPayloadRetention.ts',
    'utf8',
  )

  assert.match(migration, /retention_class TEXT NOT NULL DEFAULT 'routine'/)
  assert.match(migration, /last_tg_diagnostics JSONB/)
  assert.match(migration, /idx_forecourt_events_retention/)
  assert.doesNotMatch(migration, /DELETE FROM/)
  assert.match(persistence, /prepareForecourtEventStorage/)
  assert.match(persistence, /retention_class, payload_hash/)
  assert.match(tankWriter, /last_tg_diagnostics = \$\d+::jsonb/)
  assert.match(tankWriter, /last_tg_payload = NULL/)
  assert.doesNotMatch(
    normalizedTransactionWriter,
    /doms_unattended_receipt_json = COALESCE/,
  )
  assert.match(compaction, /transactions_unattended_payloads/)
  assert.match(compaction, /forecourt_transaction_unattended_payloads/)
  assert.match(compaction, /tank_gauge_raw_payloads/)
})
