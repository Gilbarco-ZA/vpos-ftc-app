import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyDomsFieldValidationCheckpoints,
  deriveDomsFieldValidationEvidenceCheckpoints,
  type DomsFieldValidationChecklistItem,
  type DomsFieldValidationCheckpointSummary,
} from '../../src/modules/forecourt/application/getDomsFieldValidationReadiness'

const item = (
  id: string,
  status: DomsFieldValidationChecklistItem['status'] = 'pending',
): DomsFieldValidationChecklistItem => ({
  id,
  area: 'operations',
  status,
  title: id,
  description: id,
  nextAction: 'validate',
  blocksProduction: true,
  manualValidationRequired: true,
})

const checkpoint = (
  id: string,
  status: DomsFieldValidationChecklistItem['status'],
  recordedAt: string,
): DomsFieldValidationCheckpointSummary => ({
  id: `${id}-${recordedAt}`,
  checklistItemId: id,
  status,
  note: null,
  evidenceReference: null,
  evidence: {},
  source: 'test',
  importBatchId: null,
  recordedBy: 'user-1',
  recordedAt,
})

describe('DOMS field validation release gate helpers', () => {
  it('does not accept packaging build evidence as a field-readiness checkpoint', () => {
    assert.throws(
      () =>
        deriveDomsFieldValidationEvidenceCheckpoints({
          evidenceType: 'build-test-run',
          evidenceReference: 'local-terminal-001',
          results: {
            buildPassed: true,
            testsPassed: true,
          },
        }),
      /checkpoints are required/i,
    )
  })


  it('derives live-controller evidence across connection, install status, reconciliation, and workflow checks', () => {
    const checkpoints = deriveDomsFieldValidationEvidenceCheckpoints({
      evidenceType: 'live-controller',
      sourceSystem: 'pss5000-site-a',
      results: {
        connected: true,
        installStatusCaptured: true,
        reconciliationAccepted: false,
        workflowsPassed: true,
      },
    })

    assert.deepEqual(
      checkpoints.map((entry) => [entry.checklistItemId, entry.status]),
      [
        ['jpl-live-connection-observed', 'passed'],
        ['fc-install-status-snapshot-captured', 'passed'],
        ['reconciliation-reviewed', 'blocked'],
        ['production-workflows-exercised', 'passed'],
        ['jpl-live-fp-status-conformance-validated', 'pending'],
        ['jpl-live-value-normalization-validated', 'pending'],
      ],
    )
  })

  it('derives live protocol conformance checkpoints from the generated validator evidence shape', () => {
    const checkpoints = deriveDomsFieldValidationEvidenceCheckpoints({
      evidenceType: 'jpl-live-conformance',
      evidenceReference: 'doms-jpl-live-evidence.json',
      results: {
        protocolConformance: {
          status: 'passed',
          summary: {
            fpStatusParserValidated: true,
            valueNormalizationValidated: true,
          },
          findings: [],
        },
      },
    })

    assert.deepEqual(
      checkpoints.map((entry) => [entry.checklistItemId, entry.status]),
      [
        ['jpl-live-fp-status-conformance-validated', 'passed'],
        ['jpl-live-value-normalization-validated', 'passed'],
      ],
    )
    assert.equal(
      checkpoints.every(
        (entry) => entry.evidenceReference === 'doms-jpl-live-evidence.json',
      ),
      true,
    )
  })

  it('blocks live conformance checkpoints when the validator reports parser or scaling failures', () => {
    const checkpoints = deriveDomsFieldValidationEvidenceCheckpoints({
      evidenceType: 'live-readonly-validation',
      results: {
        fpStatusParserValidated: false,
        valueNormalizationValidated: false,
      },
    })

    assert.equal(checkpoints.every((entry) => entry.status === 'blocked'), true)
  })

  it('derives reconnect, timeout, heartbeat, and transaction recovery checkpoints from session resilience evidence', () => {
    const checkpoints = deriveDomsFieldValidationEvidenceCheckpoints({
      evidenceType: 'jpl-session-resilience',
      evidenceReference: 'doms-jpl-session-selftest.json',
      results: {
        status: 'passed',
        summary: {
          forcedDisconnectObserved: true,
          reconnected: true,
          deadConnectionDetected: true,
          transactionRecoveredAfterRestart: true,
          serverHeartbeatObserved: true,
          clientHeartbeatObserved: true,
        },
      },
    })

    assert.deepEqual(
      checkpoints.map((entry) => [entry.checklistItemId, entry.status]),
      [
        ['jpl-network-reconnect-validated', 'passed'],
        ['jpl-dead-connection-detection-validated', 'passed'],
        ['jpl-transaction-recovery-validated', 'passed'],
        ['jpl-heartbeat-resilience-validated', 'passed'],
      ],
    )
    assert.equal(
      checkpoints.every(
        (entry) => entry.evidenceReference === 'doms-jpl-session-selftest.json',
      ),
      true,
    )
  })

  it('blocks resilience checkpoints when imported evidence reports failure', () => {
    const checkpoints = deriveDomsFieldValidationEvidenceCheckpoints({
      evidenceType: 'network-interruption',
      results: {
        reconnected: false,
        deadConnectionDetected: false,
        transactionRecoveredAfterRestart: false,
        heartbeatPassed: false,
      },
    })

    assert.equal(checkpoints.every((entry) => entry.status === 'blocked'), true)
  })

  it('applies only the newest checkpoint to each checklist item', () => {
    const checklist = [item('jpl-live-connection-observed')]
    const applied = applyDomsFieldValidationCheckpoints(checklist, [
      checkpoint('jpl-live-connection-observed', 'blocked', '2026-07-09T08:00:00.000Z'),
      checkpoint('jpl-live-connection-observed', 'passed', '2026-07-09T09:00:00.000Z'),
    ])

    assert.equal(applied[0]?.status, 'passed')
    assert.equal(
      (applied[0]?.evidence?.manualCheckpoint as any)?.status,
      'passed',
    )
  })
})
