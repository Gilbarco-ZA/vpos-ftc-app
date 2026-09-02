import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type {
  JplClientRuntimeDeps,
  JplCommandContext,
} from '@/src/platform/integrations/jpl/commands/contracts'
import { handleControllerRecordCommand } from '@/src/platform/integrations/jpl/commands/controllerRecords'
import { handleDirectCommand } from '@/src/platform/integrations/jpl/commands/direct'
import { handleLifecycleCommand } from '@/src/platform/integrations/jpl/commands/lifecycle'
import { handlePumpCommand } from '@/src/platform/integrations/jpl/commands/pump'
import { handleTankCommand } from '@/src/platform/integrations/jpl/commands/tank'
import { handleTransactionCommand } from '@/src/platform/integrations/jpl/commands/transactions'
import type { PosCommand } from '@/src/platform/integrations/jpl/types'

const runtime: JplClientRuntimeDeps = {
  assertAccessAllowed: async () => undefined,
  getGatewayState: () => ({
    apcs: { apc1: { connected: true, loggedOn: true } },
    controllerStatus: { state: 'online' },
    bufferHealth: { totals: { supervisedDepth: 1 } },
    bufferAlerts: [{ pumpId: 1 }],
  }),
  ensureGatewayStarted: async () => undefined,
  getClient: () => null,
  getConfig: async () => ({}),
  getReplayStatus: async () => ({
    replayCapabilities: { supervised: 'allowed', unsupervised: 'unknown' },
    pendingReplayClears: [{ fpId: 1 }],
    transactionCheckpoints: [{ fpId: 1, transSeqNo: 2 }],
  }),
}

const context = (
  cmd: PosCommand,
  overrides: Partial<JplCommandContext> = {},
): JplCommandContext => ({
  stationId: 'station-1',
  cmd,
  client: { request: async () => ({ ok: true }) },
  timeoutMs: 5000,
  posId: '07',
  fpOperationModeNo: 3,
  runtime,
  ...overrides,
})

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

const toId2 = (value: number) => String(value).padStart(2, '0')
const toId2String = (value: unknown, fallback = '00') => {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  const number = Number(text)
  return Number.isFinite(number)
    ? String(Math.trunc(number)).padStart(2, '0')
    : fallback
}
const resolvePumpNozzle = (payload: Record<string, unknown>) => ({
  pumpId: Number(payload.pumpNumber ?? payload.fpId ?? 1),
  nozzleId: Number(payload.nozzleNumber ?? 2),
})

const requestRecorder = () => {
  const requests: Array<{
    message: any
    timeoutMs: number
    timeoutMessage: string
  }> = []
  return {
    requests,
    requestWithTimeout: async (
      _client: any,
      message: any,
      timeoutMs: number,
      timeoutMessage: string,
    ) => {
      requests.push({ message, timeoutMs, timeoutMessage })
      if (message.name === 'FpSupTrans_req') {
        return {
          name: 'FpSupTrans_resp',
          subCode: '00H',
          solicited: true,
          data: {
            FpId: message.data.FpId,
            TransSeqNo: message.data.TransSeqNo,
            TransPars: {
              Vol_e: '0000001234',
              Money_e: '0000005678',
            },
          },
        }
      }
      return { accepted: true, name: message.name }
    },
  }
}

describe('JPL extracted command handlers', () => {
  describe('lifecycle commands', () => {
    it('handles ping, status, replay status, and unknown commands', async () => {
      const ping = await handleLifecycleCommand(context({ type: 'PING' }))
      const status = await handleLifecycleCommand(context({ type: 'POS_STATUS' }))
      const replay = await handleLifecycleCommand(
        context({ type: 'GET_REPLAY_STATUS' }),
      )
      const unknown = await handleLifecycleCommand(
        context({ type: 'UNKNOWN' } as any),
      )

      assert.equal((ping as any).data.connected, true)
      assert.equal((status as any).data.controllerStatus.state, 'online')
      assert.equal((status as any).data.pendingReplayClears.length, 1)
      assert.equal((replay as any).data.transactionCheckpoints.length, 1)
      assert.equal(unknown, null)
    })
  })

  describe('controller and record commands', () => {
    const calls: string[] = []
    const deps = {
      readFcStatus: async () => ({ response: 'fc' }),
      readPosConnectionStatus: async () => ({ response: 'pos' }),
      readPssPeripheralsStatus: async () => ({ response: 'pss' }),
      readFcServiceMessage: async () => ({ response: { seqNo: '1' } }),
      persistCollectedServiceMessage: async () => {
        calls.push('persist-service')
      },
      clearFcServiceMessage: async (_client: any, _timeout: number, seq: string) => ({
        seq,
      }),
      readBackOfficeRecord: async (
        _client: any,
        _timeout: number,
        subCode?: string,
      ) => ({ response: { seqNo: '2' }, usedSubCode: subCode ?? '00H' }),
      persistCollectedBackOfficeRecord: async () => {
        calls.push('persist-back-office')
      },
      clearBackOfficeRecord: async (_client: any, _timeout: number, seq: string) => ({
        seq,
      }),
    }

    it('handles controller status and record collection commands', async () => {
      assert.equal(
        (await handleControllerRecordCommand(
          context({ type: 'GET_FC_STATUS' }),
          deps,
        ))?.ok,
        true,
      )
      assert.equal(
        (await handleControllerRecordCommand(
          context({ type: 'GET_POS_CONNECTION_STATUS' }),
          deps,
        ))?.ok,
        true,
      )
      assert.equal(
        (await handleControllerRecordCommand(
          context({ type: 'GET_PSS_PERIPHERALS_STATUS' }),
          deps,
        ))?.ok,
        true,
      )

      await handleControllerRecordCommand(
        context({ type: 'GET_FC_SERVICE_LOG' }),
        deps,
      )
      const backOffice = await handleControllerRecordCommand(
        context({
          type: 'GET_BACK_OFFICE_RECORD',
          payload: { preferredSubCode: '01H' },
        }),
        deps,
      )
      assert.deepEqual(calls, ['persist-service', 'persist-back-office'])
      assert.equal((backOffice as any).data.usedSubCode, '01H')
    })

    it('validates and clears service/back-office records', async () => {
      await assert.rejects(
        handleControllerRecordCommand(
          context({ type: 'CLEAR_FC_SERVICE_LOG' }),
          deps,
        ),
        /FcServiceMsgSeqNo is required/,
      )
      await assert.rejects(
        handleControllerRecordCommand(
          context({ type: 'CLEAR_BACK_OFFICE_RECORD' }),
          deps,
        ),
        /BorSeqNo is required/,
      )

      const service = await handleControllerRecordCommand(
        context({
          type: 'CLEAR_FC_SERVICE_LOG',
          payload: { FcServiceMsgSeqNo: '10' },
        }),
        deps,
      )
      const record = await handleControllerRecordCommand(
        context({
          type: 'CLEAR_BACK_OFFICE_RECORD',
          payload: { BorSeqNo: '11' },
        }),
        deps,
      )
      assert.equal((service as any).data.seq, '10')
      assert.equal((record as any).data.seq, '11')
      assert.equal(
        await handleControllerRecordCommand(
          context({ type: 'UNKNOWN' } as any),
          deps,
        ),
        null,
      )
    })
  })

  describe('pump commands', () => {
    const baseDeps = () => {
      const recorder = requestRecorder()
      return {
        ...recorder,
        deps: {
          pick,
          toId2,
          toId2String,
          toInt: (value: unknown, fallback: number) => Number(value) || fallback,
          resolvePumpNozzle,
          requestWithTimeout: recorder.requestWithTimeout,
          readFpStatus: async (
            _client: any,
            _timeout: number,
            fpId: string,
            subCode?: string,
          ) => ({ fpId, subCode }),
          readFpInfo: async (
            _client: any,
            _timeout: number,
            fpId: string,
            parIds?: string[],
          ) => ({ fpId, parIds }),
          readFpFuellingData: async (
            _client: any,
            _timeout: number,
            fpId: string,
            subCode?: string,
          ) => ({ fpId, subCode }),
          readFpError: async (_client: any, _timeout: number, fpId: string) => ({
            fpId,
          }),
        },
      }
    }

    it('normalizes pump read command identifiers', async () => {
      const { deps } = baseDeps()
      const status = await handlePumpCommand(
        context({ type: 'GET_FP_STATUS', payload: { pumpNumber: 4, SubCode: '01H' } }),
        deps,
      )
      const info = await handlePumpCommand(
        context({ type: 'GET_FP_INFO', payload: { FpId: 5, FpInfoParId: [1, 12] } }),
        deps,
      )
      const fuel = await handlePumpCommand(
        context({ type: 'GET_FP_FUELLING_DATA', payload: { fpId: 6 } }),
        deps,
      )
      const error = await handlePumpCommand(
        context({ type: 'GET_FP_ERROR', payload: { pumpId: 7 } }),
        deps,
      )

      assert.deepEqual((status as any).data, { fpId: '04', subCode: '01H' })
      assert.deepEqual((info as any).data, {
        fpId: '05',
        parIds: ['01', '12'],
      })
      assert.equal((fuel as any).data.fpId, '06')
      assert.equal((error as any).data.fpId, '07')
    })

    it('builds authorization and preparation commands', async () => {
      const { deps, requests } = baseDeps()
      for (const type of [
        'PRESET_FUEL_AUTH',
        'EXTENDED_FUEL_AUTH',
        'PREPARE_TRANSACTION',
      ] as const) {
        const result = await handlePumpCommand(
          context({ type, payload: { pumpNumber: 3, nozzleNumber: 2 } }),
          deps,
        )
        assert.equal(result?.ok, true)
      }
      assert.equal(requests.length, 3)
      assert.ok(requests.every((entry) => entry.message.data.PosId === '07'))
    })

    it('handles pump open, authorize, close, cancel, emergency, reset, and clear', async () => {
      const { deps, requests } = baseDeps()
      const commands: PosCommand[] = [
        { type: 'OPEN_FPS', payload: { pumpNumber: 1, fpOperationModeNo: 8 } },
        { type: 'ATTENDANT_AUTH', payload: { pumpNumber: 1 } },
        { type: 'PREFUEL_CUSTOMER', payload: { pumpNumber: 1 } },
        { type: 'CLOSE_FPS', payload: { pumpNumber: 1 } },
        { type: 'CLEAR_PREFUEL_CUSTOMER', payload: { pumpNumber: 1 } },
        { type: 'CANCEL_TRANSACTION', payload: { pumpNumber: 1 } },
        { type: 'ESTOP_FP', payload: { pumpNumber: 1, posId: 9 } },
        { type: 'CANCEL_FP_ESTOP', payload: { pumpNumber: 1 } },
        { type: 'RESET_FP', payload: { pumpNumber: 1 } },
        { type: 'CLEAR_FP_ERROR', payload: { pumpNumber: 1, fpErrorCode: 4 } },
      ]
      for (const command of commands) {
        assert.equal((await handlePumpCommand(context(command), deps))?.ok, true)
      }
      assert.deepEqual(
        requests.map((entry) => entry.message.name),
        [
          'open_Fp_req',
          'authorize_Fp_req',
          'authorize_Fp_req',
          'close_Fp_req',
          'cancel_FpAuth_req',
          'cancel_FpAuth_req',
          'estop_Fp_req',
          'cancel_FpEstop_req',
          'reset_Fp_req',
          'clear_FpError_req',
        ],
      )
      assert.equal(requests.at(-1)?.message.data.FpErrorCode, '04')
      assert.equal(
        await handlePumpCommand(context({ type: 'UNKNOWN' } as any), deps),
        null,
      )
    })
  })

  describe('transaction commands', () => {
    const createDeps = () => {
      const recorder = requestRecorder()
      return {
        ...recorder,
        deps: {
          pick,
          toId2,
          resolvePumpNozzle,
          requestWithTimeout: recorder.requestWithTimeout,
        },
      }
    }

    it('handles supervised and unsupervised reads and unlocks', async () => {
      const { deps, requests } = createDeps()
      for (const type of [
        'GET_SUPERVISED_TRANSACTION',
        'GET_UNSUPERVISED_TRANSACTION',
        'UNLOCK_SUPERVISED_TRANSACTION',
        'UNLOCK_UNSUPERVISED_TRANSACTION',
      ] as const) {
        const result = await handleTransactionCommand(
          context({ type, payload: { pumpNumber: 2, transSeqNo: 12 } }),
          deps,
        )
        assert.equal(result?.ok, true)
      }
      assert.equal(requests.length, 4)
      assert.match(requests[0].message.name, /FpSupTrans/)
      assert.match(requests[1].message.name, /FpUnSupTrans/)
    })

    it('handles clear and complete transaction commands', async () => {
      const { deps, requests } = createDeps()
      const supervised = await handleTransactionCommand(
        context({
          type: 'CLEAR_SUPERVISED_TRANSACTION',
          payload: { pumpNumber: 2, transSeqNo: 12 },
        }),
        deps,
      )
      const unsupervised = await handleTransactionCommand(
        context({
          type: 'CLEAR_UNSUPERVISED_TRANSACTION',
          payload: { pumpNumber: 2, transSeqNo: 13 },
        }),
        deps,
      )
      const complete = await handleTransactionCommand(
        context({
          type: 'COMPLETE_TRANSACTION',
          payload: { pumpNumber: 2, transSeqNo: 14 },
        }),
        deps,
      )
      assert.equal(supervised?.ok, true)
      assert.equal(unsupervised?.ok, true)
      assert.equal((complete as any).data.transSeqNo, '0014')
      assert.deepEqual(
        requests.map((entry) => entry.message.name),
        [
          'FpSupTrans_req',
          'clear_FpSupTrans_req',
          'clear_FpUnSupTrans_req',
          'FpSupTrans_req',
          'clear_FpSupTrans_req',
        ],
      )
      assert.equal(requests[0].message.data.PosId, '07')
      assert.equal(requests[1].message.data.Vol_e, '0000001234')
      assert.equal(requests[1].message.data.Money_e, '0000005678')
      assert.equal(requests[3].message.data.TransSeqNo, '0014')

      await assert.rejects(
        handleTransactionCommand(
          context({ type: 'COMPLETE_TRANSACTION', payload: { pumpNumber: 2 } }),
          deps,
        ),
        /requires TransSeqNo/,
      )
      assert.equal(
        await handleTransactionCommand(
          context({ type: 'UNKNOWN' } as any),
          deps,
        ),
        null,
      )
    })
  })

  describe('tank commands', () => {
    const calls: any[] = []
    const deps = {
      pick,
      toId2String,
      sendSimpleWetstockCommand: async (
        _client: any,
        _timeout: number,
        action: string,
        payload: Record<string, unknown>,
        timeoutMessage: string,
      ) => {
        calls.push({ action, payload, timeoutMessage })
        return { response: { action } }
      },
      readTgStatus: async (
        _client: any,
        _timeout: number,
        tgId: string,
        subCode?: string,
      ) => ({ tgId, subCode }),
      readSiteDeliveryStatus: async (
        _client: any,
        _timeout: number,
        subCode?: string,
      ) => ({ subCode }),
      readTankDeliveryData: async (
        _client: any,
        _timeout: number,
        tgId: string,
        posId: string,
        itemIds?: string[],
      ) => ({ tgId, posId, itemIds }),
      clearTankDeliveryData: async (
        _client: any,
        _timeout: number,
        payload: Record<string, unknown>,
      ) => payload,
    }

    it('handles tank controller and delivery lifecycle commands', async () => {
      for (const type of [
        'OPEN_TANK_CONTROLLER',
        'CLOSE_TANK_CONTROLLER',
        'START_DELIVERY_PROCESS',
        'STOP_DELIVERY_PROCESS',
      ] as const) {
        const result = await handleTankCommand(
          context({ type, payload: { tankId: 3 } }),
          deps,
        )
        assert.equal(result?.ok, true)
      }
      assert.deepEqual(
        calls.map((entry) => entry.action),
        [
          'OPEN_TANK_CONTROLLER',
          'CLOSE_TANK_CONTROLLER',
          'START_DELIVERY_PROCESS',
          'STOP_DELIVERY_PROCESS',
        ],
      )
      await assert.rejects(
        handleTankCommand(context({ type: 'OPEN_TANK_CONTROLLER' }), deps),
        /TankId is required/,
      )
    })

    it('handles tank status, buffer status, delivery reads, and clears', async () => {
      const status = await handleTankCommand(
        context({ type: 'GET_TG_STATUS', payload: { TgId: 4, SubCode: '01H' } }),
        deps,
      )
      const buffer = await handleTankCommand(
        context({ type: 'GET_TRANSACTION_BUFFER_STATUS' }),
        deps,
      )
      const site = await handleTankCommand(
        context({ type: 'GET_SITE_DELIVERY_STATUS', payload: { subCode: '00H' } }),
        deps,
      )
      const delivery = await handleTankCommand(
        context({
          type: 'GET_TANK_DELIVERY_DATA',
          payload: { tankId: 5, posId: 8, tankDeliveryDataItemId: [1, 12] },
        }),
        deps,
      )
      const clear = await handleTankCommand(
        context({
          type: 'CLEAR_TANK_DELIVERY_DATA',
          payload: {
            DeliveryReportSeqNo: '9',
            TankDeliveries: [{ TgId: 5, TankDeliverySeqNo: 2 }],
          },
        }),
        deps,
      )

      assert.deepEqual((status as any).data, { tgId: '04', subCode: '01H' })
      assert.equal((buffer as any).data.bufferAlerts.length, 1)
      assert.equal((site as any).data.subCode, '00H')
      assert.deepEqual((delivery as any).data, {
        tgId: '05',
        posId: '08',
        itemIds: ['01', '12'],
      })
      assert.deepEqual((clear as any).data, {
        PosId: '07',
        DeliveryReportSeqNo: '9',
        TankDeliveries: [{ TgId: '05', TankDeliverySeqNo: '02' }],
      })
      await assert.rejects(
        handleTankCommand(context({ type: 'GET_TANK_DELIVERY_DATA' }), deps),
        /TgId is required/,
      )
      assert.equal(
        await handleTankCommand(context({ type: 'UNKNOWN' } as any), deps),
        null,
      )
    })
  })

  describe('direct protocol commands', () => {
    it('builds direct requests and ignores unrelated commands', async () => {
      const recorder = requestRecorder()
      const result = await handleDirectCommand(
        context({ type: 'UTIL_ECHO', payload: { data: 'hello', PosId: 9 } }),
        { pick, requestWithTimeout: recorder.requestWithTimeout },
      )
      assert.equal(result?.ok, true)
      assert.equal(recorder.requests[0].message.name, 'UtilEcho_req')
      assert.equal(
        recorder.requests[0].timeoutMessage,
        'Timed out sending JPL echo command',
      )
      assert.equal(
        await handleDirectCommand(context({ type: 'UNKNOWN' } as any), {
          pick,
          requestWithTimeout: recorder.requestWithTimeout,
        }),
        null,
      )
    })
  })
})
