import assert from 'node:assert/strict'
import test from 'node:test'

import { validateDomsDeploymentSignOff } from '../../src/modules/forecourt/application/recordDomsDeploymentSignOff'

const validRequest = {
  acceptanceDigest: 'digest-1',
  deploymentArtifact: 'vpos-ftc-app-2026.07.13',
  pssTargetFingerprint: 'site-01|10.0.0.5|8889|470-02-1.07',
  fieldEngineer: 'Engineer A',
  supportRepresentative: 'Support B',
  softwareOwner: 'Owner C',
  deploymentOwner: 'Owner D',
  decision: 'approved',
  exceptions: [],
  confirmAcceptanceDefinitionReviewed: true,
  confirmAllBlockingCheckpointsPassed: true,
  confirmTargetPssVerified: true,
  confirmNoPssWrite: true,
}

test('accepts approval only for the current ready acceptance definition', () => {
  const result = validateDomsDeploymentSignOff({
    request: validRequest,
    expectedAcceptanceDigest: 'digest-1',
    blockingItemCount: 0,
    productionReleaseStatus: 'ready-for-final-review',
  })
  assert.equal(result.decision, 'approved')
  assert.equal(result.acceptanceDigest, 'digest-1')
})

test('rejects stale acceptance digest', () => {
  assert.throws(
    () =>
      validateDomsDeploymentSignOff({
        request: validRequest,
        expectedAcceptanceDigest: 'digest-2',
        blockingItemCount: 0,
        productionReleaseStatus: 'ready-for-final-review',
      }),
    /does not match/,
  )
})

test('rejects approval while production blockers remain', () => {
  assert.throws(
    () =>
      validateDomsDeploymentSignOff({
        request: validRequest,
        expectedAcceptanceDigest: 'digest-1',
        blockingItemCount: 2,
        productionReleaseStatus: 'blocked',
      }),
    /production-blocking checkpoint/,
  )
})

test('allows a rejected decision with documented exceptions', () => {
  const result = validateDomsDeploymentSignOff({
    request: {
      ...validRequest,
      decision: 'rejected',
      exceptions: ['Reconnect rehearsal failed.'],
      confirmAllBlockingCheckpointsPassed: false,
      confirmTargetPssVerified: false,
    },
    expectedAcceptanceDigest: 'digest-1',
    blockingItemCount: 3,
    productionReleaseStatus: 'blocked',
  })
  assert.equal(result.decision, 'rejected')
  assert.deepEqual(result.exceptions, ['Reconnect rehearsal failed.'])
})
