import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runDomsJplSessionResilienceSelfTest } from '../../src/modules/forecourt/infrastructure/jpl/simulatorSessionValidation'

describe('DOMS/JPL simulator session resilience', () => {
  it('covers welcome, logon, heartbeats, reconnect, recovery, and dead timeout', async () => {
    const report = await runDomsJplSessionResilienceSelfTest({
      port: 0,
      timeoutMs: 1_000,
      heartbeatMs: 25,
      deadConnectionTimeoutMs: 80,
    })

    assert.equal(report.status, 'passed', report.error ?? undefined)
    assert.equal(report.summary.connected, true)
    assert.equal(report.summary.welcomeReceived, true)
    assert.equal(report.summary.logonPassed, true)
    assert.equal(report.summary.bootstrapStatusObserved, true)
    assert.equal(report.summary.serverHeartbeatObserved, true)
    assert.equal(report.summary.clientHeartbeatObserved, true)
    assert.equal(report.summary.forcedDisconnectObserved, true)
    assert.equal(report.summary.reconnected, true)
    assert.equal(report.summary.transactionRecoveredAfterRestart, true)
    assert.equal(report.summary.deadConnectionDetected, true)
    assert.equal(
      report.firstTransaction?.TransSeqNo,
      report.recoveredTransaction?.TransSeqNo,
    )
    assert.equal(report.simulatorStats.totalConnections, 2)
    assert.equal(report.simulatorStats.forcedDisconnects, 1)
  })
})
