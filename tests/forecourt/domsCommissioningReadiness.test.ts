import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildDomsFirstSiteCommissioningChecklist,
  buildDomsLegacyToJplRunbook,
  validateDomsLiveConnectionSettings,
} from '../../src/modules/forecourt/application/domsCommissioningReadiness.helpers'

const validSettings = {
  jplHost: '192.168.10.20',
  jplPort: 8888,
  jplPosId: '01',
  jplAccessCode:
    'POS,RI,UNSO_INSTSTA_1,UNSO_TRBUFSTA_3,UNSO_TGSTA_1,UNSO_DELIVSTA_1,UNSO_PRISTA_1,UNSO_FPSTA_3:MFDR=05',
  jplCountryCode: '1',
  jplPosVersionId: '470-02-1.08',
  jplExpectedMinVersion: '470-02-1.07',
  jplHeartbeatIntervalMs: 15000,
  jplDeadConnectionTimeoutMs: 30000,
  jplUnsolicitedDrSeconds: 5,
  jplUnsolicitedFlags: [
    'UNSO_INSTSTA_1',
    'UNSO_TRBUFSTA_3',
    'UNSO_TGSTA_1',
    'UNSO_DELIVSTA_1',
    'UNSO_PRISTA_1',
  ],
  jplUnsolicitedMfdrFlags: ['UNSO_FPSTA_3'],
  jplStatusUpdateCode: 3,
  jplBootstrapSnapshotEnabled: true,
  bufferWarnDepthSup: 2,
  bufferCritDepthSup: 5,
  bufferWarnAgeMinSup: 5,
  bufferCritAgeMinSup: 15,
  bufferWarnDepthUnsup: 1,
  bufferCritDepthUnsup: 3,
  bufferWarnAgeMinUnsup: 2,
  bufferCritAgeMinUnsup: 10,
  jplTlsRequired: false,
}

describe('DOMS commissioning readiness helpers', () => {
  it('accepts complete first-site live JPL settings', () => {
    const result = validateDomsLiveConnectionSettings(validSettings)

    assert.equal(result.status, 'ready')
    assert.equal(result.blockers.length, 0)
  })

  it('blocks reserved POS IDs and missing subscription flags', () => {
    const result = validateDomsLiveConnectionSettings({
      ...validSettings,
      jplPosId: '00',
      jplUnsolicitedFlags: ['UNSO_INSTSTA_1'],
      jplUnsolicitedMfdrFlags: [],
    })

    assert.equal(result.status, 'blocked')
    assert.ok(result.blockers.some((item) => item.id === 'jpl-pos-id'))
    assert.ok(
      result.blockers.some((item) => item.id === 'general-unsolicited-flags'),
    )
    assert.ok(result.blockers.some((item) => item.id === 'pump-mfdr-flags'))
  })

  it('warns on localhost because it is only suitable for simulator rehearsals', () => {
    const result = validateDomsLiveConnectionSettings({
      ...validSettings,
      jplHost: '127.0.0.1',
    })

    assert.equal(result.status, 'ready-with-warnings')
    assert.equal(result.warnings[0]?.id, 'jpl-host')
  })

  it('requires TLS deployments to use the secure JPL port', () => {
    const result = validateDomsLiveConnectionSettings({
      ...validSettings,
      jplTlsRequired: true,
      jplPort: 8888,
    })

    assert.equal(result.status, 'blocked')
    assert.ok(result.blockers.some((item) => item.id === 'jpl-tls-port'))
  })

  it('exposes first-site commissioning and JPL-only cutover steps', () => {
    const commissioning = buildDomsFirstSiteCommissioningChecklist()
    const runbook = buildDomsLegacyToJplRunbook()

    assert.ok(
      commissioning.some((step) => step.id === 'commissioning-pss-configurator'),
    )
    assert.ok(runbook.some((step) => step.id === 'legacy-test-jpl-logon'))
  })
})
