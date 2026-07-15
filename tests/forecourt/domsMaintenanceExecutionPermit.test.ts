import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateDomsMaintenanceExecutionPermit } from '../../src/modules/forecourt/application/domsMaintenanceExecutionPermit'

const user = {
  id: 'u1',
  username: 'engineer',
  email: 'engineer@example.test',
  role: 'field_engineer',
  stationId: 's1',
  station: { id: 's1', code: 'S1', name: 'Test Station', country: 'ZA' },
} as const
const now = new Date('2026-07-13T08:00:00.000Z')
const input = {
  stationId: 's1', sessionId: 'session-1', commandName: 'install_Fp_req',
  commandDigest: 'abc', comparisonDigest: 'abc', confirmationId: 'confirm-1',
  confirmationExpiresAt: '2026-07-13T08:01:00.000Z',
  reconciliationObservedAt: '2026-07-13T07:58:00.000Z',
  sessionExpiresAt: '2026-07-13T09:00:00.000Z', targetFingerprint: 'pss:site-1:serial-42',
  confirmTargetFingerprint: true, confirmOneTimePermit: true, confirmKillSwitchReviewed: true,
}

test('remains blocked by default', () => {
  const result = evaluateDomsMaintenanceExecutionPermit(input, user, {
    now,
    env: {},
    fieldValidationComplete: true,
    trustedApproval: {
      signOffId: 'signoff-1',
      acceptanceDigest: 'acceptance-1',
      deploymentArtifact: 'release-1',
    },
  })
  assert.equal(result.allowed, false)
  assert.match(result.blockers.join(' '), /feature flag is disabled/)
  assert.match(result.blockers.join(' '), /kill switch is active/)
})

test('issues a short-lived signed permit only when every gate passes', () => {
  const result = evaluateDomsMaintenanceExecutionPermit(input, user, {
    now,
    fieldValidationComplete: true,
    trustedApproval: {
      signOffId: 'signoff-1',
      acceptanceDigest: 'acceptance-1',
      deploymentArtifact: 'release-1',
    },
    env: {
      DOMS_PSS_WRITE_EXECUTION_ENABLED: 'true',
      DOMS_PSS_WRITE_KILL_SWITCH: 'false',
      DOMS_PSS_WRITE_PERMIT_SECRET: '0123456789abcdef0123456789abcdef',
    },
  })
  assert.equal(result.allowed, true)
  if (!result.allowed) return
  assert.equal(result.sendsDomsCommand, false)
  assert.equal(result.permit.expiresAt, '2026-07-13T08:00:30.000Z')
  assert.equal(result.permit.signature.length, 64)
})

test('rejects digest drift, stale evidence, and non-field-engineer roles', () => {
  const result = evaluateDomsMaintenanceExecutionPermit({
    ...input,
    comparisonDigest: 'changed',
    reconciliationObservedAt: '2026-07-13T07:40:00.000Z',
  }, { ...user, role: 'administrator' }, {
    now,
    fieldValidationComplete: true,
    trustedApproval: {
      signOffId: 'signoff-1',
      acceptanceDigest: 'acceptance-1',
      deploymentArtifact: 'release-1',
    },
    env: {
      DOMS_PSS_WRITE_EXECUTION_ENABLED: 'true',
      DOMS_PSS_WRITE_KILL_SWITCH: 'false',
      DOMS_PSS_WRITE_PERMIT_SECRET: '0123456789abcdef0123456789abcdef',
    },
  })
  assert.equal(result.allowed, false)
  assert.match(result.blockers.join(' '), /field_engineer role required/)
  assert.match(result.blockers.join(' '), /digest drift/)
  assert.match(result.blockers.join(' '), /snapshot is stale/)
})

test('rejects caller assertions when no persisted approval is supplied', () => {
  const result = evaluateDomsMaintenanceExecutionPermit(
    input,
    user,
    {
      now,
      fieldValidationComplete: true,
      trustedApproval: null,
      env: {
        DOMS_PSS_WRITE_EXECUTION_ENABLED: 'true',
        DOMS_PSS_WRITE_KILL_SWITCH: 'false',
        DOMS_PSS_WRITE_PERMIT_SECRET:
          '0123456789abcdef0123456789abcdef',
      },
    },
  )

  assert.equal(result.allowed, false)
  assert.match(
    result.blockers.join(' '),
    /database-backed deployment sign-off is missing/,
  )
})
