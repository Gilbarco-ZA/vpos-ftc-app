import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildDomsTransactionIdentity,
  extractDomsFinishToken,
  parseDomsCompactDateTime,
  shouldStartNewDomsSequenceIncarnation,
} from '../../src/modules/forecourt/infrastructure/jpl/transactionIdentity'

describe('DOMS transaction incarnation identity', () => {
  it('extracts FinishDate/FinishTime from TransPars', () => {
    assert.equal(
      extractDomsFinishToken({
        TransPars: { FinishDate: '20260811', FinishTime: '100459' },
      }),
      '20260811100459',
    )
  })

  it('uses finish time as the strongest deterministic identity evidence', () => {
    assert.equal(
      buildDomsTransactionIdentity({
        sourceMode: 'supervised',
        fpId: 1,
        transSeqNo: 1,
        finishToken: '20260811100459',
        masterResetToken: '20260811081532',
      }),
      'finish:supervised:1:0001:20260811100459',
    )
  })

  it('recognizes a reused sequence after a controller Master Reset', () => {
    const masterResetAt = parseDomsCompactDateTime('20260811081532')
    assert.equal(
      shouldStartNewDomsSequenceIncarnation({
        existingFirstSeenAt: new Date(2026, 7, 7, 9, 34, 29),
        masterResetAt,
      }),
      true,
    )
  })

  it('keeps idempotent recovery when no newer incarnation evidence exists', () => {
    assert.equal(
      shouldStartNewDomsSequenceIncarnation({
        existingFirstSeenAt: new Date(2026, 7, 11, 10, 5, 0),
        finishAt: new Date(2026, 7, 11, 10, 4, 59),
        masterResetAt: new Date(2026, 7, 11, 8, 15, 32),
      }),
      false,
    )
  })
})
