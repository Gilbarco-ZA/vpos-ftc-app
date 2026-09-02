import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { JplCommandContext } from '@/src/platform/integrations/jpl/commands/contracts'
import type { ResolvedPricingCommandDeps } from '@/src/platform/integrations/jpl/commands/pricing/contracts'
import {
  extractEntries,
  extractExplicitPriceBank,
  extractPendingPriceSets,
  mergePriceBank,
  normalizePriceValue,
  toFcDateTime,
  toId2String,
  toPriceBank,
  ZERO_FC_DATE_TIME,
} from '@/src/platform/integrations/jpl/commands/pricing/mapping'
import { handleGetGradePrices } from '@/src/platform/integrations/jpl/commands/pricing/read'
import {
  handleChangeGradePrices,
  handleClearPendingPriceSet,
} from '@/src/platform/integrations/jpl/commands/pricing/scheduling'
import type { PosCommand } from '@/src/platform/integrations/jpl/types'

const context = (cmd: PosCommand): JplCommandContext => ({
  stationId: 'station-1',
  cmd,
  client: {},
  timeoutMs: 5000,
  posId: '07',
  fpOperationModeNo: 3,
  runtime: {
    assertAccessAllowed: async () => undefined,
    getGatewayState: () => ({}),
    ensureGatewayStarted: async () => undefined,
    getClient: () => null,
    getConfig: async () => ({}),
    getReplayStatus: async () => ({}),
  },
})

const deps = (
  overrides: Partial<ResolvedPricingCommandDeps> = {},
): ResolvedPricingCommandDeps => ({
  readPriceSetStatus: async () => ({
    response: { pending: [] },
    usedSubCode: '01H',
    usedName: 'FcPriceSetStatus_req',
    supportsPendingQueue: true,
  }),
  readCurrentPriceSet: async () => ({
    response: null,
    usedSubCode: '04H',
    usedName: 'FcPriceSet_req',
  }),
  readSpecificPriceSet: async () => ({
    response: null,
    usedSubCode: '04H',
    usedName: 'FcPriceSet_req',
  }),
  changePriceSet: async () => ({
    response: { accepted: true },
    usedSubCode: '04H',
    usedName: 'change_FcPriceSet_req',
    preservesPendingQueue: true,
  }),
  clearPendingPriceSet: async () => ({
    response: { cleared: true },
    usedSubCode: '00H',
    usedName: 'clear_PendingFcPriceSet_req',
  }),
  ...overrides,
})

describe('JPL pricing mapping modules', () => {
  it('normalizes ids and all supported date shapes', () => {
    assert.equal(toId2String('7'), '07')
    assert.equal(toId2String(-4), '00')
    assert.equal(toId2String('bad', 'fallback'), 'fallback')
    assert.equal(toFcDateTime(null), ZERO_FC_DATE_TIME)
    assert.equal(toFcDateTime('20260723'), '20260723000000')
    assert.equal(toFcDateTime('20260723080910'), '20260723080910')
    assert.equal(toFcDateTime('2026-07-23T08:09'), '20260723080900')
    assert.equal(
      toFcDateTime(new Date(2026, 6, 23, 8, 9, 10)),
      '20260723080910',
    )
  })

  it('normalizes integer, decimal, comma, and invalid prices', () => {
    assert.equal(normalizePriceValue(1234), '1234')
    assert.equal(normalizePriceValue(12.345), '1235')
    assert.equal(normalizePriceValue('12,34'), '1234')
    assert.throws(() => normalizePriceValue(''), /Missing price value/)
    assert.throws(() => normalizePriceValue('R 12.34'), /Invalid price value/)
  })

  it('extracts list and scalar aliases while skipping empty items', () => {
    assert.deepEqual(
      extractEntries({
        items: [
          null,
          { gradeId: 1 },
          { productId: 2, amount: '17.50' },
        ],
      }),
      [
        {
          productId: '02',
          gradeId: undefined,
          priceGroupId: undefined,
          price: '1750',
        },
      ],
    )
    assert.deepEqual(extractEntries({ fcGradeId: 4, value: 1999 }), [
      {
        productId: undefined,
        gradeId: '04',
        priceGroupId: undefined,
        price: '1999',
      },
    ])
    assert.deepEqual(extractEntries({}), [])
  })

  it('maps controller aliases and rejects incomplete price banks', () => {
    assert.deepEqual(
      toPriceBank({
        data: {
          priceSetId: 3,
          priceGroups: [{ id: 1 }],
          grades: [{ value: 2 }],
          Prices: [[{ Price_e: { value: '1888' } }]],
          userId: 'operator',
        },
      }),
      {
        fcPriceSetId: '03',
        fcPriceGroupIds: ['01'],
        fcGradeIds: ['02'],
        fcPriceGroups: [['1888']],
        fcPriceSetDateAndTime: undefined,
        userId: 'operator',
      },
    )
    assert.equal(
      extractExplicitPriceBank({
        fcPriceSetId: 1,
        fcPriceGroupIds: [1],
        fcGradeIds: [1],
      }),
      null,
    )
    assert.deepEqual(extractPendingPriceSets({ pending: 'not-an-array' }), [])
  })

  it('pads incomplete matrices and rejects entries without a grade', () => {
    const merged = mergePriceBank(
      {
        fcPriceSetId: '01',
        fcPriceGroupIds: ['01', '02'],
        fcGradeIds: ['01', '02'],
        fcPriceGroups: [['1000']],
      },
      [{ productId: '02', priceGroupId: '02', price: '2000' }],
    )
    assert.deepEqual(merged.fcPriceGroups, [
      ['1000', '0'],
      ['0', '2000'],
    ])
    assert.throws(
      () =>
        mergePriceBank(
          {
            fcPriceSetId: '01',
            fcPriceGroupIds: ['01'],
            fcGradeIds: ['01'],
            fcPriceGroups: [['1000']],
          },
          [{ price: '2000' }],
        ),
      /productId or gradeId/,
    )
  })
})

describe('JPL pricing read and scheduling modules', () => {
  it('returns pending capabilities without reading a missing match', async () => {
    let specificReads = 0
    const result = await handleGetGradePrices(
      context({
        type: 'GET_GRADE_PRICES',
        payload: { type: 'pending', priceSetId: 9 },
      }),
      deps({
        readPriceSetStatus: async () => ({
          response: {
            pending: [{ fcPriceSetId: '01', activationAt: '20260724080000' }],
          },
          usedSubCode: '01H',
          supportsPendingQueue: true,
        }),
        readSpecificPriceSet: async () => {
          specificReads += 1
          throw new Error('should not run')
        },
      }),
    )
    assert.equal(specificReads, 0)
    assert.equal((result as any).data.requestedPending, null)
    assert.equal(
      (result as any).data.capabilities.supportsSpecificPendingPriceSet,
      false,
    )
  })

  it('reads a matched pending set and records unsupported specific reads', async () => {
    const baseDeps = deps({
      readPriceSetStatus: async () => ({
        response: {
          pending: [{ fcPriceSetId: '02', activationAt: '20260724080000' }],
        },
        usedSubCode: '01H',
        supportsPendingQueue: true,
      }),
    })
    const success = await handleGetGradePrices(
      context({
        type: 'GET_GRADE_PRICES',
        payload: {
          type: 'pending',
          priceSetId: 2,
          activationAt: '2026-07-24 08:00',
        },
      }),
      deps({
        ...baseDeps,
        readSpecificPriceSet: async () => ({
          response: { FcPriceSetId: '02' },
          usedSubCode: '04H',
        }),
      }),
    )
    assert.equal((success as any).data.requestedPending.FcPriceSetId, '02')
    assert.equal(
      (success as any).data.capabilities.supportsSpecificPendingPriceSet,
      true,
    )

    const unsupported = await handleGetGradePrices(
      context({
        type: 'GET_GRADE_PRICES',
        payload: { type: 'pending', priceSetId: 2 },
      }),
      deps({
        ...baseDeps,
        readSpecificPriceSet: async () => {
          throw new Error('specific pending reads unsupported')
        },
      }),
    )
    assert.match((unsupported as any).data.requestedPendingError, /unsupported/)
    assert.equal((unsupported as any).data.warnings.length, 1)
  })

  it('returns a successful current price-set read', async () => {
    const result = await handleGetGradePrices(
      context({ type: 'GET_GRADE_PRICES' }),
      deps({
        readCurrentPriceSet: async () => ({
          response: { FcPriceSetId: '01' },
          usedSubCode: '04H',
        }),
      }),
    )
    assert.equal((result as any).data.current.FcPriceSetId, '01')
    assert.equal(
      (result as any).data.capabilities.currentPriceSetSubCode,
      '04H',
    )
  })

  it('reports degraded status and current-read failures as warnings/data', async () => {
    const result = await handleGetGradePrices(
      context({ type: 'GET_GRADE_PRICES' }),
      deps({
        readPriceSetStatus: async () => ({
          response: { current: true },
          usedSubCode: '00H',
          supportsPendingQueue: false,
        }),
        readCurrentPriceSet: async () => {
          throw new Error('current bank unavailable')
        },
      }),
    )
    assert.equal((result as any).data.current, null)
    assert.match((result as any).data.currentError, /unavailable/)
    assert.equal((result as any).data.pending.length, 0)
    assert.equal((result as any).data.warnings.length, 1)
  })

  it('normalizes defaults when clearing a pending set', async () => {
    const calls: any[] = []
    const result = await handleClearPendingPriceSet(
      context({ type: 'CLEAR_PENDING_PRICE_SET', payload: {} }),
      deps({
        clearPendingPriceSet: async (_client, _timeout, id, activationAt) => {
          calls.push({ id, activationAt })
          return {
            response: { cleared: true },
            usedSubCode: '00H',
          }
        },
      }),
    )
    assert.deepEqual(calls, [
      { id: '00', activationAt: ZERO_FC_DATE_TIME },
    ])
    assert.equal((result as any).data.response.cleared, true)
  })

  it('rejects an empty scheduling payload before reading controller state', async () => {
    let statusReads = 0
    const result = await handleChangeGradePrices(
      context({ type: 'CHANGE_GRADE_PRICES', payload: {} }),
      deps({
        readPriceSetStatus: async () => {
          statusReads += 1
          throw new Error('should not run')
        },
      }),
    )
    assert.equal(statusReads, 0)
    assert.equal((result as any).accepted, false)
    assert.match((result as any).error, /No price entries/)
  })

  it('rejects scheduling when neither controller nor request has a full bank', async () => {
    const result = await handleChangeGradePrices(
      context({
        type: 'CHANGE_GRADE_PRICES',
        payload: { gradeId: 1, price: '19.99' },
      }),
      deps({
        readCurrentPriceSet: async () => {
          throw new Error('not loaded')
        },
      }),
    )
    assert.equal((result as any).accepted, false)
    assert.match((result as any).error, /Unable to resolve/)
  })

  it('prefers the controller bank and warns when fallback scheduling is unverified', async () => {
    const submitted: any[] = []
    let statusReads = 0
    const result = await handleChangeGradePrices(
      context({
        type: 'CHANGE_GRADE_PRICES',
        payload: {
          entries: [{ gradeId: 2, price: '20.01' }],
          activationAt: '2026-07-25 08:00',
          requestedBy: 'cashier',
          fcPriceSetId: 9,
          fcPriceGroupIds: [9],
          fcGradeIds: [2],
          fcPriceGroups: [['9999']],
        },
      }),
      deps({
        readPriceSetStatus: async () => {
          statusReads += 1
          return {
            response: { pending: [] },
            usedSubCode: '00H',
            supportsPendingQueue: false,
          }
        },
        readCurrentPriceSet: async () => ({
          response: {
            FcPriceSetId: 1,
            FcPriceGroupId: [1],
            FcGradeId: [1, 2],
            FcPriceGroups: [['1000', '1900']],
          },
          usedSubCode: '03H',
        }),
        changePriceSet: async (_client, _timeout, payload) => {
          submitted.push(payload)
          return {
            response: { accepted: true },
            usedSubCode: '03H',
            preservesPendingQueue: false,
          }
        },
      }),
    )
    assert.equal(statusReads, 2)
    assert.equal(submitted[0].fcPriceSetId, '01')
    assert.equal(submitted[0].fcPriceGroups[0][1], '2001')
    assert.equal((result as any).data.verifiedOnController, false)
    assert.equal((result as any).data.warnings.length, 2)
  })

  it('clears only the matching pending activation before scheduling', async () => {
    const cleared: string[] = []
    let statusReads = 0
    await handleChangeGradePrices(
      context({
        type: 'CHANGE_GRADE_PRICES',
        payload: {
          price: 2200,
          gradeId: 1,
          activationAt: '20260726090000',
          replaceExistingAtSameActivation: true,
          fcPriceSetId: 1,
          fcPriceGroupIds: [1],
          fcGradeIds: [1],
          fcPriceGroups: [['1000']],
        },
      }),
      deps({
        readPriceSetStatus: async () => {
          statusReads += 1
          return {
            response: {
              pending:
                statusReads === 1
                  ? [
                      { fcPriceSetId: '01', activationAt: '20260726090000' },
                      { fcPriceSetId: '02', activationAt: '20260726090000' },
                      { fcPriceSetId: '01', activationAt: '20260727090000' },
                    ]
                  : [
                      { fcPriceSetId: '01', activationAt: '20260726090000' },
                    ],
            },
            usedSubCode: '01H',
            supportsPendingQueue: true,
          }
        },
        readCurrentPriceSet: async () => {
          throw new Error('use explicit')
        },
        clearPendingPriceSet: async (_client, _timeout, id, activationAt) => {
          cleared.push(`${id}:${activationAt}`)
          return { response: {}, usedSubCode: '00H' }
        },
      }),
    )
    assert.deepEqual(cleared, ['01:20260726090000'])
  })
})
