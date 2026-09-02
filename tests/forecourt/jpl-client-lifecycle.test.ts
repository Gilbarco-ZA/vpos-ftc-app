import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { JplClientRuntimeDeps } from '@/src/platform/integrations/jpl/client'

import {
  jplHealth,
  jplSendPosCommand,
} from '@/src/platform/integrations/jpl/client'

const connectedState = {
  started: true,
  apcs: { apc1: { connected: true, loggedOn: true } },
  version: '1.2.3',
  secureMode: true,
  controllerStatus: { state: 'ONLINE' },
  pumpStatuses: [{ fpId: '01', at: 1 }],
  serviceMessages: [{ seqNo: '1', message: 'ready', at: 1 }],
}

const createRuntime = (
  overrides: Partial<JplClientRuntimeDeps> = {},
): JplClientRuntimeDeps => ({
  assertAccessAllowed: async () => 'jpl',
  getGatewayState: () => connectedState as any,
  ensureGatewayStarted: async () => undefined,
  getClient: () => ({ request: async () => ({ ok: true }) }) as any,
  getConfig: async () => ({
    host: '127.0.0.1',
    appId: 'POS',
    countryCode: '1',
    posId: 4,
    timeoutMs: 100,
  }),
  getReplayStatus: async () => ({
    replayCapabilities: { supervised: 'allowed', unsupervised: 'unknown' },
    pendingReplayClears: [{ fpId: 1, transSeqNo: 2 }],
    transactionCheckpoints: [{ sourceMode: 'supervised', fpId: 1, transSeqNo: 2 }],
  }) as any,
  ...overrides,
})

describe('JPL client lifecycle', () => {
  it('reports connected health using injected access, state, and config', async () => {
    const accessCalls: unknown[] = []
    const health = await jplHealth(
      'station-1',
      { accessMode: 'forecourt' },
      createRuntime({
        assertAccessAllowed: async (...args) => {
          accessCalls.push(args)
          return 'jpl'
        },
      }),
    )

    assert.deepEqual(accessCalls, [['station-1', 'forecourt']])
    assert.equal(health.ok, true)
    assert.equal(health.host, '127.0.0.1')
    assert.equal(health.version, '1.2.3')
    assert.equal(health.secureMode, true)
    assert.deepEqual(health.controllerStatus, { state: 'ONLINE' })
    assert.equal(health.error, undefined)
  })

  it('reports a disconnected gateway without throwing', async () => {
    const health = await jplHealth(
      'station-1',
      {},
      createRuntime({
        getGatewayState: () => ({
          started: false,
          apcs: { apc1: { connected: false, loggedOn: false } },
        }) as any,
        getConfig: async () => null,
      }),
    )

    assert.equal(health.ok, false)
    assert.equal(health.host, '')
    assert.equal(health.error, 'JPL gateway not started')
    assert.deepEqual(health.pumpStatuses, [])
  })

  it('returns a controlled error when gateway startup fails', async () => {
    const result = await jplSendPosCommand(
      'station-1',
      { type: 'PING' },
      {},
      createRuntime({
        getGatewayState: () => ({ started: false, apcs: {} }) as any,
        ensureGatewayStarted: async () => {
          throw new Error('controller offline')
        },
      }),
    )

    assert.deepEqual(result, {
      ok: false,
      accepted: false,
      error: 'controller offline',
    })
  })

  it('uses an injected command queue and recovers after a startup failure', async () => {
    let started = false
    let startAttempts = 0
    let queueCalls = 0
    const runtime = createRuntime({
      getGatewayState: () => ({
        ...connectedState,
        started,
      }) as any,
      ensureGatewayStarted: async () => {
        startAttempts += 1
        if (startAttempts === 1) throw new Error('temporary startup failure')
        started = true
      },
      enqueueCommand: async (task) => {
        queueCalls += 1
        return await task()
      },
    })

    const failed = await jplSendPosCommand(
      'station-1',
      { type: 'PING' },
      {},
      runtime,
    )
    assert.equal(failed.ok, false)
    assert.equal(failed.error, 'temporary startup failure')

    const recovered = await jplSendPosCommand(
      'station-1',
      { type: 'PING' },
      {},
      runtime,
    )
    assert.equal(recovered.ok, true)
    assert.equal(startAttempts, 2)
    assert.equal(queueCalls, 1)
  })

  it('fails cleanly when APC1 is unavailable after startup', async () => {
    const result = await jplSendPosCommand(
      'station-1',
      { type: 'PING' },
      {},
      createRuntime({ getClient: () => null }),
    )

    assert.deepEqual(result, {
      ok: false,
      accepted: false,
      error: 'APC1 client not available',
    })
  })

  it('handles ping and status commands without network requests', async () => {
    let requests = 0
    const runtime = createRuntime({
      getClient: () =>
        ({
          request: async () => {
            requests += 1
            return { unexpected: true }
          },
        }) as any,
    })

    const ping = await jplSendPosCommand('station-1', { type: 'PING' }, {}, runtime)
    const status = await jplSendPosCommand(
      'station-1',
      { type: 'POS_STATUS' },
      {},
      runtime,
    )
    const replay = await jplSendPosCommand(
      'station-1',
      { type: 'GET_REPLAY_STATUS' },
      {},
      runtime,
    )

    assert.deepEqual(ping, {
      ok: true,
      accepted: true,
      data: { connected: true, loggedOn: true },
    })
    assert.equal((status as any).data.connected, true)
    assert.equal((status as any).data.replayCapabilities.supervised, 'allowed')
    assert.equal((status as any).data.pendingReplayClears.length, 1)
    assert.equal((replay as any).data.transactionCheckpoints.length, 1)
    assert.equal(requests, 0)
  })

  it('routes extracted pump, tank, and transaction commands through the client facade', async () => {
    const requests: any[] = []
    const runtime = createRuntime({
      getGatewayState: () => ({
        ...connectedState,
        bufferHealth: { totals: { supervisedDepth: 2 } },
        bufferAlerts: [{ pumpId: 1, reasons: ['depth'] }],
      }) as any,
      getClient: () =>
        ({
          request: async (message: any, options: unknown) => {
            requests.push({ message, options })
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
            return { accepted: true }
          },
        }) as any,
    })

    const open = await jplSendPosCommand(
      'station-1',
      { type: 'OPEN_FPS', payload: { pumpNumber: 2 } },
      {},
      runtime,
    )
    const buffer = await jplSendPosCommand(
      'station-1',
      { type: 'GET_TRANSACTION_BUFFER_STATUS' },
      {},
      runtime,
    )
    const complete = await jplSendPosCommand(
      'station-1',
      {
        type: 'COMPLETE_TRANSACTION',
        payload: { pumpNumber: 2, transSeqNo: 14 },
      },
      {},
      runtime,
    )

    assert.equal(open.ok, true)
    assert.equal((buffer as any).data.bufferHealth.totals.supervisedDepth, 2)
    assert.equal((complete as any).data.transSeqNo, '0014')
    assert.deepEqual(
      requests.map((entry) => entry.message.name),
      ['open_Fp_req', 'FpSupTrans_req', 'clear_FpSupTrans_req'],
    )
    assert.equal(requests[1].message.data.PosId, '04')
    assert.equal(requests[2].message.data.Vol_e, '0000001234')
    assert.equal(requests[2].message.data.Money_e, '0000005678')
  })

  it('normalizes tank identifiers through the facade helpers', async () => {
    const requests: any[] = []
    const runtime = createRuntime({
      getClient: () =>
        ({
          request: async (message: any) => {
            requests.push(message)
            return { data: { TgId: message.data.TgId, TgStatus: {} } }
          },
        }) as any,
    })

    const numeric = await jplSendPosCommand(
      'station-1',
      { type: 'GET_TG_STATUS', payload: { tankId: '4' } },
      {},
      runtime,
    )
    const invalid = await jplSendPosCommand(
      'station-1',
      { type: 'GET_TG_STATUS', payload: { tankId: 'invalid' } },
      {},
      runtime,
    )

    assert.equal(numeric.ok, true)
    assert.equal(invalid.ok, true)
    assert.deepEqual(
      requests.map((request) => request.data.TgId),
      ['04', '00'],
    )
  })

  it('serializes concurrent direct commands through the default APC1 queue', async () => {
    let releaseFirst!: () => void
    let resolveStarted!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let active = 0
    let maxActive = 0
    let requests = 0

    const runtime = createRuntime({
      getClient: () =>
        ({
          request: async () => {
            requests += 1
            active += 1
            maxActive = Math.max(maxActive, active)
            if (requests === 1) {
              resolveStarted()
              await firstRelease
            }
            active -= 1
            return { requestNo: requests }
          },
        }) as any,
    })

    const first = jplSendPosCommand(
      'station-1',
      { type: 'UTIL_ECHO', payload: { data: 'first' } },
      {},
      runtime,
    )
    const second = jplSendPosCommand(
      'station-1',
      { type: 'UTIL_ECHO', payload: { data: 'second' } },
      {},
      runtime,
    )

    await firstStarted
    assert.equal(requests, 1)
    releaseFirst()
    await Promise.all([first, second])

    assert.equal(requests, 2)
    assert.equal(maxActive, 1)
  })

  it('builds and sends direct commands through the injected client', async () => {
    const requests: any[] = []
    const result = await jplSendPosCommand(
      'station-1',
      { type: 'UTIL_ECHO', payload: { data: 'hello' } },
      {},
      createRuntime({
        getClient: () =>
          ({
            request: async (message: unknown, options: unknown) => {
              requests.push({ message, options })
              return { echoed: true }
            },
          }) as any,
      }),
    )

    assert.equal(result.ok, true)
    assert.equal(result.accepted, true)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].message.name, 'UtilEcho_req')
    assert.deepEqual((result as any).data.response, { echoed: true })
  })

  it('returns unsupported-command and request errors as rejected results', async () => {
    const unsupported = await jplSendPosCommand(
      'station-1',
      { type: 'NOT_REAL' } as any,
      {},
      createRuntime(),
    )
    assert.equal(unsupported.ok, false)
    assert.match(unsupported.error ?? '', /Unsupported JPL command type/)

    const failed = await jplSendPosCommand(
      'station-1',
      { type: 'UTIL_ECHO', payload: { data: 'hello' } },
      {},
      createRuntime({
        getClient: () =>
          ({ request: async () => Promise.reject(new Error('socket closed')) }) as any,
      }),
    )
    assert.deepEqual(failed, {
      ok: false,
      accepted: false,
      error: 'socket closed',
    })
  })
})
