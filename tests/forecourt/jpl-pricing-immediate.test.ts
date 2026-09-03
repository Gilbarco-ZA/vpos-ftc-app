import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { JplCommandContext } from '@/src/platform/integrations/jpl/commands/contracts'
import type { ResolvedPricingCommandDeps } from '@/src/platform/integrations/jpl/commands/pricing/contracts'
import { ZERO_FC_DATE_TIME } from '@/src/platform/integrations/jpl/commands/pricing/mapping'
import { handleChangeGradePrices } from '@/src/platform/integrations/jpl/commands/pricing/scheduling'
import type { PosCommand } from '@/src/platform/integrations/jpl/types'

const context = (payload: Record<string, unknown>): JplCommandContext => ({
  stationId: 'station-1',
  cmd: { type: 'CHANGE_GRADE_PRICES', payload } as PosCommand,
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

const bank = {
  FcPriceSetId: '01',
  FcPriceGroupId: ['01'],
  FcGradeId: ['01', '02'],
  FcPriceGroups: [['1000', '1900']],
}

function deps(
  overrides: Partial<ResolvedPricingCommandDeps> = {},
): ResolvedPricingCommandDeps {
  return {
    readPriceSetStatus: async () => ({
      response: { data: { FcPendingPriceSet: [] } },
      usedSubCode: '01H',
      usedName: 'FcPriceSetStatus_req',
      supportsPendingQueue: true,
    }),
    readCurrentPriceSet: async () => ({
      response: { data: bank },
      usedSubCode: '04H',
      usedName: 'FcPriceSet_req',
    }),
    readSpecificPriceSet: async () => ({
      response: null,
      usedSubCode: '04H',
      usedName: 'FcPriceSet_req',
    }),
    changePriceSet: async () => ({
      response: { data: { FcPriceSetId: '01' } },
      usedSubCode: '04H',
      usedName: 'change_FcPriceSet_req',
      preservesPendingQueue: true,
    }),
    clearPendingPriceSet: async () => ({
      response: {},
      usedSubCode: '00H',
      usedName: 'clear_PendingFcPriceSet_req',
    }),
    ...overrides,
  }
}

describe('DOMS immediate price changes', () => {
  it('uses the zero activation timestamp and verifies the active bank', async () => {
    const submitted: any[] = []
    let currentReads = 0

    const result = await handleChangeGradePrices(
      context({
        applyNow: true,
        entries: [{ gradeId: 2, price: '20.01' }],
      }),
      deps({
        readCurrentPriceSet: async () => {
          currentReads += 1
          return {
            response: {
              data:
                currentReads === 1
                  ? bank
                  : {
                      ...bank,
                      FcPriceGroups: [['1000', '2001']],
                    },
            },
            usedSubCode: '04H',
            usedName: 'FcPriceSet_req',
          }
        },
        changePriceSet: async (_client, _timeout, payload, options) => {
          submitted.push({ payload, options })
          return {
            response: { data: { FcPriceSetId: '01' } },
            usedSubCode: '04H',
            usedName: 'change_FcPriceSet_req',
            preservesPendingQueue: true,
          }
        },
      }),
    )

    assert.equal(submitted[0].payload.activationAt, ZERO_FC_DATE_TIME)
    assert.equal((result as any).data.applyNow, true)
    assert.equal((result as any).data.scheduled, null)
    assert.equal((result as any).data.verifiedOnController, true)
    assert.equal(currentReads, 2)
  })

  it('requires SUBC 04 when existing pending prices must be preserved', async () => {
    const submitted: any[] = []
    let statusReads = 0

    await handleChangeGradePrices(
      context({
        applyNow: true,
        entries: [{ gradeId: 2, price: '20.01' }],
      }),
      deps({
        readPriceSetStatus: async () => {
          statusReads += 1
          return {
            response: {
              data: {
                FcPendingPriceSet:
                  statusReads === 1
                    ? [
                        {
                          FcPriceSetId: '01',
                          PriceSetActivationDateAndTime: '20260904120000',
                        },
                      ]
                    : [],
              },
            },
            usedSubCode: '01H',
            usedName: 'FcPriceSetStatus_req',
            supportsPendingQueue: true,
          }
        },
        readCurrentPriceSet: async () => ({
          response: {
            data: {
              ...bank,
              FcPriceGroups: [['1000', '2001']],
            },
          },
          usedSubCode: '04H',
          usedName: 'FcPriceSet_req',
        }),
        changePriceSet: async (_client, _timeout, payload, options) => {
          submitted.push({ payload, options })
          return {
            response: { data: { FcPriceSetId: '01' } },
            usedSubCode: '04H',
            usedName: 'change_FcPriceSet_req',
            preservesPendingQueue: true,
          }
        },
      }),
    )

    assert.equal(submitted[0].options.requirePreservePendingQueue, true)
  })

  it('keeps scheduled changes on the pending-queue verification path', async () => {
    let statusReads = 0
    const result = await handleChangeGradePrices(
      context({
        effectiveAt: '2026-09-04T12:00',
        entries: [{ gradeId: 2, price: '20.01' }],
      }),
      deps({
        readPriceSetStatus: async () => {
          statusReads += 1
          return {
            response: {
              data: {
                FcPendingPriceSet:
                  statusReads === 1
                    ? []
                    : [
                        {
                          FcPriceSetId: '01',
                          PriceSetActivationDateAndTime: '20260904120000',
                        },
                      ],
              },
            },
            usedSubCode: '01H',
            usedName: 'FcPriceSetStatus_req',
            supportsPendingQueue: true,
          }
        },
      }),
    )

    assert.equal((result as any).data.applyNow, false)
    assert.equal((result as any).data.activationAt, '20260904120000')
    assert.equal((result as any).data.verifiedOnController, true)
    assert.equal((result as any).data.scheduled.activationAt, '20260904120000')
  })
})
