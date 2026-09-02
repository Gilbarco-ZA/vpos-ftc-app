import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { JplCommandContext } from '@/src/platform/integrations/jpl/commands/contracts'
import {
  extractDeliveryTgIdsFromSiteStatus,
  extractDeliveryTgIdsFromTgStatus,
  handleDeliveryCommand,
} from '@/src/platform/integrations/jpl/commands/delivery'
import { handleDynamicTankCommand } from '@/src/platform/integrations/jpl/commands/dynamicTank'
import {
  changePriceSet,
  clearPendingPriceSet,
  extractEntries,
  extractExplicitPriceBank,
  extractPendingPriceSets,
  handlePricingCommand,
  mergePriceBank,
  normalizePriceValue,
  readCurrentPriceSet,
  readPriceSetStatus,
  toFcDateTime,
  toPriceBank,
} from '@/src/platform/integrations/jpl/commands/pricing'
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

describe('remaining JPL command handlers', () => {
  describe('pricing', () => {
    it('normalizes prices, dates, and entry aliases', () => {
      assert.equal(normalizePriceValue(12.34), '1234')
      assert.equal(normalizePriceValue('12,34'), '1234')
      assert.equal(normalizePriceValue('1234'), '1234')
      assert.throws(() => normalizePriceValue('bad'), /Invalid price value/)
      assert.equal(toFcDateTime('2026-07-22'), '20260722000000')
      assert.equal(toFcDateTime('2026-07-22 08:09:10'), '20260722080910')
      assert.throws(() => toFcDateTime('not-a-date'), /Invalid effective/)
      assert.deepEqual(
        extractEntries({
          gradePrices: [
            { fcGradeId: 1, fcPriceGroupId: 2, pricePerLiter: '18.75' },
          ],
        }),
        [
          {
            productId: undefined,
            gradeId: '01',
            priceGroupId: '02',
            price: '1875',
          },
        ],
      )
    })

    it('normalizes explicit, controller, and pending price-set shapes', () => {
      assert.deepEqual(
        extractExplicitPriceBank({
          FcPriceSetId: 2,
          FcPriceGroupId: [1],
          FcGradeId: [1, 2],
          FcPriceGroups: [['1000', { value: '2000' }]],
          UserId: 'operator',
        }),
        {
          fcPriceSetId: '02',
          fcPriceGroupIds: ['01'],
          fcGradeIds: ['01', '02'],
          fcPriceGroups: [['1000', '2000']],
          fcPriceSetDateAndTime: undefined,
          userId: 'operator',
        },
      )
      assert.equal(extractExplicitPriceBank({ FcPriceSetId: 2 }), null)
      assert.equal(
        toPriceBank({ data: { FcPriceSetId: '01' } }),
        null,
      )
      assert.deepEqual(
        extractPendingPriceSets({
          data: {
            FcPendingPriceSet: [
              {
                FcPriceSetId: 3,
                PriceSetActivationDateAndTime: '20260726080000',
              },
              { FcPriceSetId: 4 },
            ],
          },
        }),
        [{ fcPriceSetId: '03', activationAt: '20260726080000' }],
      )
    })

    it('uses controller subcode fallbacks for price operations', async () => {
      const requests: Array<{ name: string; subCode: string }> = []
      const client = {
        request: async (message: any) => {
          requests.push({ name: message.name, subCode: message.subCode })
          if (message.name === 'FcPriceSet_req' && message.subCode === '04H') {
            throw new Error(
              'Unknown message FcPriceSet_req subcode "04H"; closest matching command',
            )
          }
          return { accepted: true, subCode: message.subCode }
        },
      }

      const status = await readPriceSetStatus(client, 100)
      const current = await readCurrentPriceSet(client, 100)
      const changed = await changePriceSet(client, 100, {
        userId: 'tester',
        fcPriceSetId: '01',
        fcPriceGroupIds: ['01'],
        fcGradeIds: ['01'],
        fcPriceGroups: [['1234']],
        activationAt: '20260726080000',
      })
      const cleared = await clearPendingPriceSet(
        client,
        100,
        '01',
        '20260726080000',
      )

      assert.equal(status.usedSubCode, '01H')
      assert.equal(status.supportsPendingQueue, true)
      assert.equal(current.usedSubCode, '03H')
      assert.equal(changed.usedSubCode, '04H')
      assert.equal(changed.preservesPendingQueue, true)
      assert.equal(cleared.usedName, 'clear_PendingFcPriceSet_req')
      assert.deepEqual(
        requests
          .filter((entry) => entry.name === 'FcPriceSet_req')
          .map((entry) => entry.subCode),
        ['04H', '03H'],
      )
    })

    it('merges price entries and rejects unknown grades or groups', () => {
      const base = {
        fcPriceSetId: '01',
        fcPriceGroupIds: ['01', '02'],
        fcGradeIds: ['01', '02'],
        fcPriceGroups: [['1000'], ['1100', '1200']],
      }
      assert.deepEqual(
        mergePriceBank(base, [{ gradeId: '02', price: '1999' }])
          .fcPriceGroups,
        [
          ['1000', '1999'],
          ['1100', '1999'],
        ],
      )
      assert.throws(
        () => mergePriceBank(base, [{ gradeId: '99', price: '1' }]),
        /Grade 99/,
      )
      assert.throws(
        () =>
          mergePriceBank(base, [
            { gradeId: '01', priceGroupId: '99', price: '1' },
          ]),
        /Price group 99/,
      )
    })

    it('reads current and pending prices through injected protocol operations', async () => {
      const status = {
        response: {
          FcPendingPriceSet: [
            {
              FcPriceSetId: '02',
              PriceSetActivationDateAndTime: '20260723080000',
            },
          ],
        },
        usedSubCode: '01H',
        supportsPendingQueue: true,
      }
      const current = await handlePricingCommand(
        context({ type: 'GET_GRADE_PRICES' }),
        {
          readPriceSetStatus: async () => status,
          readCurrentPriceSet: async () => ({
            response: { FcPriceSetId: '01' },
            usedSubCode: '04H',
            usedName: 'FcPriceSet_req',
          }),
        },
      )
      assert.equal((current as any).data.current.FcPriceSetId, '01')
      assert.equal(
        (current as any).data.capabilities.currentPriceSetSubCode,
        '04H',
      )

      const pending = await handlePricingCommand(
        context({
          type: 'GET_GRADE_PRICES',
          payload: { type: 'pending', priceSetId: 2 },
        }),
        {
          readPriceSetStatus: async () => status,
          readSpecificPriceSet: async () => ({
            response: { requested: true },
            usedSubCode: '04H',
            usedName: 'FcPriceSet_req',
          }),
        },
      )
      assert.equal((pending as any).data.requestedPending.requested, true)
    })

    it('handles unavailable pending reads and clear operations', async () => {
      const status = {
        response: {
          pending: [
            { fcPriceSetId: '03', activationAt: '20260724090000' },
          ],
        },
        usedSubCode: '01H',
        supportsPendingQueue: true,
      }
      const pending = await handlePricingCommand(
        context({
          type: 'GET_GRADE_PRICES',
          payload: { type: 'pending', priceSetId: 3 },
        }),
        {
          readPriceSetStatus: async () => status,
          readSpecificPriceSet: async () => {
            throw new Error('unsupported')
          },
        },
      )
      assert.match((pending as any).data.requestedPendingError, /unsupported/)

      const cleared = await handlePricingCommand(
        context({
          type: 'CLEAR_PENDING_PRICE_SET',
          payload: { priceSetId: 3, activationAt: '2026-07-24 09:00' },
        }),
        {
          clearPendingPriceSet: async (_client, _timeout, id, activation) => ({
            response: { id, activation },
            usedSubCode: '00H',
            usedName: 'clear_PendingFcPriceSet_req',
          }),
          readPriceSetStatus: async () => status,
        },
      )
      assert.equal((cleared as any).data.fcPriceSetId, '03')
      assert.equal((cleared as any).data.activationAt, '20260724090000')
    })

    it('schedules merged prices and clears matching pending entries', async () => {
      const clears: string[] = []
      const statusBefore = {
        response: {
          pending: [
            { fcPriceSetId: '01', activationAt: '20260725080000' },
          ],
        },
        usedSubCode: '01H',
        supportsPendingQueue: true,
      }
      let statusReads = 0
      const result = await handlePricingCommand(
        context({
          type: 'CHANGE_GRADE_PRICES',
          payload: {
            entries: [{ gradeId: 2, price: '19.99' }],
            activationAt: '2026-07-25 08:00',
            clearExistingAtSameActivation: true,
            fcPriceSetId: 1,
            fcPriceGroupIds: [1],
            fcGradeIds: [1, 2],
            fcPriceGroups: [['1000', '1200']],
          },
        }),
        {
          readPriceSetStatus: async () => {
            statusReads += 1
            return statusReads === 1
              ? statusBefore
              : {
                  ...statusBefore,
                  response: {
                    pending: [
                      {
                        fcPriceSetId: '01',
                        activationAt: '20260725080000',
                      },
                    ],
                  },
                }
          },
          readCurrentPriceSet: async () => {
            throw new Error('no current bank')
          },
          clearPendingPriceSet: async (_client, _timeout, id) => {
            clears.push(id)
            return {
              response: {},
              usedSubCode: '00H',
              usedName: 'clear_PendingFcPriceSet_req',
            }
          },
          changePriceSet: async (_client, _timeout, payload) => ({
            response: { accepted: true, payload },
            usedSubCode: '04H',
            usedName: 'change_FcPriceSet_req',
            preservesPendingQueue: true,
          }),
        },
      )
      assert.deepEqual(clears, ['01'])
      assert.equal((result as any).data.verifiedOnController, true)
      assert.equal((result as any).data.priceBank.fcPriceGroups[0][1], '1999')
    })

    it('rejects empty scheduling requests and ignores unknown commands', async () => {
      const empty = await handlePricingCommand(
        context({ type: 'CHANGE_GRADE_PRICES', payload: {} }),
      )
      assert.equal((empty as any).accepted, false)
      assert.equal(
        await handlePricingCommand(context({ type: 'UNKNOWN' } as any)),
        null,
      )
    })
  })

  describe('dynamic tank data', () => {
    it('collects configured tanks while isolating per-tank failures', async () => {
      const snapshots: string[] = []
      const result = await handleDynamicTankCommand(
        context({ type: 'GET_ALL_TG_DATA', payload: { stationId: 's1' } }),
        {
          resolveConfiguredTankGaugeIds: async () => ['01', '02'],
          resolveStationTimeZone: async () => 'Africa/Dar_es_Salaam',
          requestWithTimeout: async (_client, message) => {
            if (message.data.TgId === '02') throw new Error('tank offline')
            return { data: { TgId: '01', ProductLevel: '100' } }
          },
          requestWithSubCodeFallback: async () => ({
            response: { data: { TgId: '00' } },
            usedName: 'TgStatus_req',
            usedSubCode: '02H',
          }),
          rememberGatewaySnapshot: (kind) => {
            snapshots.push(kind)
            return { kind }
          },
          normalizeTgDataPayload: (_payload, options) => ({
            tgId: '01',
            productLevel: 100,
            timeZone: options?.timeZone,
          }),
          getProtocolErrorText: (error) => String((error as Error).message),
        },
      )
      assert.equal((result as any).data.responses.length, 1)
      assert.equal((result as any).data.errors[0].tgId, '02')
      assert.deepEqual(snapshots, ['TgData_resp'])
      assert.equal(
        (result as any).data.normalized[0].timeZone,
        'Africa/Dar_es_Salaam',
      )
      assert.equal((result as any).data.stationTimeZone, 'Africa/Dar_es_Salaam')
      assert.equal((result as any).data.tankStatusSnapshot, null)
    })

    it('collects the optional tank status snapshot only when explicitly requested', async () => {
      const snapshots: string[] = []
      const result = await handleDynamicTankCommand(
        context({
          type: 'GET_ALL_TG_DATA',
          payload: { stationId: 's1', includeStatusSnapshot: true },
        }),
        {
          resolveConfiguredTankGaugeIds: async () => ['01'],
          resolveStationTimeZone: async () => 'UTC',
          requestWithTimeout: async () => ({ data: { TgId: '01' } }),
          requestWithSubCodeFallback: async () => ({
            response: { data: { TgId: '00' } },
            usedName: 'TgStatus_req',
            usedSubCode: '02H',
          }),
          rememberGatewaySnapshot: (kind) => {
            snapshots.push(kind)
            return { kind }
          },
          normalizeTgDataPayload: () => ({ tgId: '01' }),
        },
      )

      assert.deepEqual(snapshots, ['TgData_resp', 'TgStatus_resp'])
      assert.equal((result as any).data.tankStatusSnapshot.usedSubCode, '02H')
    })

    it('fails when no tanks are configured or every request fails', async () => {
      await assert.rejects(
        handleDynamicTankCommand(
          context({ type: 'GET_ALL_TG_DATA', payload: { stationId: 's1' } }),
          { resolveConfiguredTankGaugeIds: async () => [] },
        ),
        /No configured DOMS tank ids/,
      )
      await assert.rejects(
        handleDynamicTankCommand(
          context({ type: 'GET_ALL_TG_DATA', payload: { stationId: 's1' } }),
          {
            resolveConfiguredTankGaugeIds: async () => ['01'],
            resolveStationTimeZone: async () => 'UTC',
            requestWithTimeout: async () => {
              throw new Error('offline')
            },
            getProtocolErrorText: () => 'offline',
          },
        ),
        /offline/,
      )
    })

    it('updates dynamic data and reads tank errors', async () => {
      const messages: any[] = []
      const deps = {
        requestWithTimeout: async (_client: any, message: any) => {
          messages.push(message)
          return { ok: true }
        },
        normalizeDomsDynamicTankDataRequest: () => ({
          tankId: '04',
          dtdPars: [{ DtdParId: '01', DtdParValue: '2' }],
        }),
      }
      await handleDynamicTankCommand(
        context({ type: 'CHANGE_DYNAMIC_TANK_DATA', payload: {} }),
        deps,
      )
      await handleDynamicTankCommand(
        context({ type: 'GET_TG_ERROR_MSG', payload: { tankId: 4 } }),
        deps,
      )
      assert.equal(messages[0].name, 'change_DynamicTankData_req')
      assert.equal(messages[1].data.TgId, '04')
      assert.equal(
        await handleDynamicTankCommand(context({ type: 'UNKNOWN' } as any)),
        null,
      )
    })
  })

  describe('aggregate tank deliveries', () => {
    it('extracts candidates from site and multi-message tank status', () => {
      assert.deepEqual(
        extractDeliveryTgIdsFromSiteStatus(
          {},
          () => ({
            readyTgIds: ['01'],
            tankDeliveries: [{ TgId: 2 }],
            tankTicketedDeliveries: [],
            tgIds: ['01'],
          }),
        ),
        ['01', '02'],
      )
      assert.deepEqual(
        extractDeliveryTgIdsFromTgStatus({
          messages: [
            {
              name: 'TgStatus_resp',
              data: {
                TgId: '03',
                TgSubStates: { bits: { DeliveryDataReady: true } },
              },
            },
            {
              name: 'TgStatus_resp',
              data: { TgId: '04', TgSubStates: {} },
            },
          ],
        }),
        ['03'],
      )
    })

    it('collects, normalizes, and summarizes delivery data', async () => {
      const result = await handleDeliveryCommand(
        context({ type: 'GET_ALL_TANK_DELIVERY_DATA' }),
        {
          requestWithSubCodeFallback: async (_client, options) => ({
            response: { source: options.name },
            usedName: options.name,
            usedSubCode: '01H',
          }),
          rememberGatewaySnapshot: () => ({
            readyTgIds: ['01', '02'],
            tankDeliveries: [],
            tankTicketedDeliveries: [],
            tgIds: [],
          }),
          normalizeSiteDeliveryStatusPayload: () => ({
            readyTgIds: ['01', '02'],
            tankDeliveries: [],
            tankTicketedDeliveries: [],
            tgIds: [],
          }),
          buildJplCommandRequest: (_action, payload) => ({
            name: 'TankDeliveryData_req',
            subCode: '00H',
            data: payload,
          }),
          requestWithTimeout: async (_client, message) => {
            if (message.data.tgId === '02') throw new Error('read failed')
            return { data: { TgId: message.data.tgId } }
          },
          getProtocolErrorText: (error) => String((error as Error).message),
          normalizeTankDeliveryDataPayload: () => ({
            tgId: '01',
            deliveryReportSeqNo: '10',
            tankDeliverySeqNo: '20',
            clearTarget: { TgId: '01' },
          }),
        },
      )
      assert.deepEqual((result as any).data.tgIds, ['01', '02'])
      assert.equal((result as any).data.deliveries.length, 1)
      assert.equal((result as any).data.errors[0].tgId, '02')
      assert.equal((result as any).data.checkpointSummary[0].clearStatus, 'pending_clear')
    })

    it('falls back to TgStatus and returns null for unrelated commands', async () => {
      let reads = 0
      const result = await handleDeliveryCommand(
        context({ type: 'GET_ALL_TANK_DELIVERY_DATA' }),
        {
          requestWithSubCodeFallback: async (_client, options) => {
            reads += 1
            if (reads === 1) throw new Error('site status unavailable')
            return {
              response: {
                data: {
                  TgId: '05',
                  TgSubStates: { DeliveryInProgress: true },
                },
              },
              usedName: options.name,
              usedSubCode: '00H',
            }
          },
          buildJplCommandRequest: (_action, payload) => ({
            name: 'TankDeliveryData_req',
            subCode: '00H',
            data: payload,
          }),
          requestWithTimeout: async () => ({ data: { TgId: '05' } }),
          normalizeTankDeliveryDataPayload: () => ({ tgId: '05' }),
          getProtocolErrorText: (error) => String((error as Error).message),
        },
      )
      assert.deepEqual((result as any).data.tgIds, ['05'])
      assert.equal(
        await handleDeliveryCommand(context({ type: 'UNKNOWN' } as any)),
        null,
      )
    })
  })
})
