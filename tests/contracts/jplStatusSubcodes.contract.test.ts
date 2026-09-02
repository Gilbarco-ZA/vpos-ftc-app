import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFpStatusSubCodePreference } from '@/src/modules/forecourt/infrastructure/jpl/dispense'
import { buildJplCommandRequest } from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import { prepareJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'

const missingPackages = new Set(
  String(process.env.VPOS_TEST_MISSING_PRIVATE_PACKAGES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const skipReason = missingPackages.has('@gilbarcoafs/doms-pos-jpl')
  ? '@gilbarcoafs/doms-pos-jpl is unavailable; run npm run test:vendor in an authenticated environment.'
  : false

test(
  'authenticated DOMS package accepts degraded controller status subcodes',
  { skip: skipReason },
  () => {
    assert.deepEqual(buildFpStatusSubCodePreference('02h'), [
      '02H',
      '03H',
      '01H',
      '00H',
    ])

    const requests = [
      buildJplCommandRequest('GET_FP_STATUS', {
        fpId: '04',
        subCode: '02H',
      }),
      buildJplCommandRequest('GET_FP_FUELLING_DATA', {
        fpId: '04',
        subCode: '00H',
      }),
      buildJplCommandRequest('GET_TG_STATUS', {
        tgId: '07',
        subCode: '00H',
      }),
      buildJplCommandRequest('GET_SITE_DELIVERY_STATUS', {
        subCode: '00H',
      }),
    ]

    assert.deepEqual(
      requests.map((request) => [request?.name, request?.subCode]),
      [
        ['FpStatus_req', '02H'],
        ['FpFuellingData_req', '00H'],
        ['TgStatus_req', '00H'],
        ['SiteDeliveryStatus_req', '00H'],
      ],
    )

    for (const request of requests) {
      assert.ok(request)
      assert.doesNotThrow(() => prepareJplOutboundMessage(request))
    }
  },
)
