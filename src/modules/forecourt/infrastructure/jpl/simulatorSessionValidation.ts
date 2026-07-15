import * as net from 'node:net'
import type { DomsJplSimulatorEnvelope } from '@/src/modules/forecourt/infrastructure/jpl/simulator'

import { evaluateJplConnectionLiveness } from '@/src/modules/forecourt/infrastructure/jpl/sessionPolicy'
import {
  createDomsJplSimulator,
  encodeDomsJplFrame,
  extractDomsJplFrames,
} from '@/src/modules/forecourt/infrastructure/jpl/simulator'

type JsonObject = Record<string, unknown>

type SessionClientOptions = {
  host: string
  port: number
  timeoutMs: number
}

export type DomsJplSessionResilienceOptions = {
  host?: string
  port?: number
  timeoutMs?: number
  heartbeatMs?: number
  deadConnectionTimeoutMs?: number
}

export type DomsJplSessionResilienceReport = {
  generatedAt: string
  mode: 'doms-jpl-session-resilience-self-test'
  status: 'passed' | 'failed'
  target: {
    host: string
    port: number
    heartbeatMs: number
    deadConnectionTimeoutMs: number
  }
  summary: {
    connected: boolean
    welcomeReceived: boolean
    logonPassed: boolean
    bootstrapStatusObserved: boolean
    serverHeartbeatObserved: boolean
    clientHeartbeatObserved: boolean
    forcedDisconnectObserved: boolean
    reconnected: boolean
    transactionRecoveredAfterRestart: boolean
    deadConnectionDetected: boolean
  }
  firstTransaction: JsonObject | null
  recoveredTransaction: JsonObject | null
  simulatorStats: ReturnType<
    ReturnType<typeof createDomsJplSimulator>['getStats']
  >
  error: string | null
}

const positiveInt = (value: unknown, fallback: number, max = 300_000) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const correlationId = (label: string) =>
  `doms-session-${label}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

class SessionClient {
  private socket: net.Socket | null = null
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private readonly queue: DomsJplSimulatorEnvelope[] = []
  private readonly waiters: Array<{
    predicate: (message: DomsJplSimulatorEnvelope) => boolean
    resolve: (message: DomsJplSimulatorEnvelope) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }> = []
  private closeResolver: (() => void) | null = null
  private closePromise: Promise<void> = Promise.resolve()

  lastMessageAt: number | null = null

  constructor(private readonly options: SessionClientOptions) {}

  async connect() {
    const socket = net.connect({
      host: this.options.host,
      port: this.options.port,
    })
    this.socket = socket
    this.closePromise = new Promise((resolve) => {
      this.closeResolver = resolve
    })

    socket.on('data', (chunk) => this.handleData(chunk))
    socket.on('close', () => {
      this.closeResolver?.()
      this.closeResolver = null
      this.rejectWaiters('Socket closed')
    })
    socket.on('error', (error) => this.rejectWaiters(error.message))

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error('Timed out connecting to local DOMS/JPL simulator')),
        this.options.timeoutMs,
      )
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  close() {
    this.socket?.destroy()
    this.socket = null
  }

  waitForClose(timeoutMs = this.options.timeoutMs) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for socket close')),
        timeoutMs,
      )
      this.closePromise.then(() => {
        clearTimeout(timer)
        resolve()
      }, reject)
    })
  }

  send(message: DomsJplSimulatorEnvelope) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('DOMS/JPL session client is not connected')
    }
    this.socket.write(encodeDomsJplFrame(message))
  }

  async request(
    name: string,
    data: JsonObject = {},
    subCode = '00H',
  ): Promise<DomsJplSimulatorEnvelope> {
    const id = correlationId(name)
    this.send({ name, subCode, data, correlationId: id })
    return this.waitFor((message) => message.correlationId === id)
  }

  async waitFor(
    predicate: (message: DomsJplSimulatorEnvelope) => boolean,
    timeoutMs = this.options.timeoutMs,
  ) {
    const existingIndex = this.queue.findIndex(predicate)
    if (existingIndex >= 0) {
      const [existing] = this.queue.splice(existingIndex, 1)
      return existing
    }

    return new Promise<DomsJplSimulatorEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((entry) => entry.timer === timer)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(new Error('Timed out waiting for DOMS/JPL session message'))
      }, timeoutMs)
      this.waiters.push({ predicate, resolve, reject, timer })
    })
  }

  private handleData(chunk: Buffer<ArrayBufferLike>) {
    const extracted = extractDomsJplFrames(Buffer.concat([this.buffer, chunk]))
    this.buffer = extracted.remainder

    for (const frame of extracted.frames) {
      if (!frame.message) continue
      this.lastMessageAt = Date.now()
      const waiterIndex = this.waiters.findIndex((waiter) =>
        waiter.predicate(frame.message as DomsJplSimulatorEnvelope),
      )
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1)
        clearTimeout(waiter.timer)
        waiter.resolve(frame.message)
      } else {
        this.queue.push(frame.message)
      }
    }
  }

  private rejectWaiters(reason: string) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(reason))
    }
  }
}

const logon = async (client: SessionClient) => {
  const response = await client.request('FcLogon_req', {
    FcAccessCode: 'POS,RI,UNSO_FPSTA_3,UNSO_TRBUFSTA_3,UNSO_INSTSTA_1',
    CountryCode: '0710',
    PosVersionId: 'vpos-ftc-session-self-test',
  })
  return response.name === 'FcLogon_resp'
}

const readSupervisedTransaction = async (client: SessionClient) => {
  const response = await client.request('FpSupTrans_req', {
    FpId: '01',
    TransSeqNo: '0201',
    PosId: '01',
    TransParId: ['51', '64', '65', '66'],
  })
  if (response.name !== 'FpSupTrans_resp') {
    throw new Error(`Expected FpSupTrans_resp, received ${response.name}`)
  }
  return response.data
}

const sameTransaction = (
  first: JsonObject | null,
  recovered: JsonObject | null,
) =>
  Boolean(
    first &&
    recovered &&
    first.FpId === recovered.FpId &&
    first.TransSeqNo === recovered.TransSeqNo &&
    JSON.stringify(first.TransPars) === JSON.stringify(recovered.TransPars),
  )

export const runDomsJplSessionResilienceSelfTest = async (
  options: DomsJplSessionResilienceOptions = {},
): Promise<DomsJplSessionResilienceReport> => {
  const host = options.host ?? '127.0.0.1'
  const timeoutMs = positiveInt(options.timeoutMs, 1_000)
  const heartbeatMs = positiveInt(options.heartbeatMs, 25)
  const deadConnectionTimeoutMs = positiveInt(
    options.deadConnectionTimeoutMs,
    Math.max(heartbeatMs + 25, 100),
  )
  const simulator = createDomsJplSimulator({
    host,
    port: options.port ?? 0,
    scenario: 'transaction-recovery',
    heartbeatMs,
  })

  let firstClient: SessionClient | null = null
  let secondClient: SessionClient | null = null
  let firstTransaction: JsonObject | null = null
  let recoveredTransaction: JsonObject | null = null
  const summary = {
    connected: false,
    welcomeReceived: false,
    logonPassed: false,
    bootstrapStatusObserved: false,
    serverHeartbeatObserved: false,
    clientHeartbeatObserved: false,
    forcedDisconnectObserved: false,
    reconnected: false,
    transactionRecoveredAfterRestart: false,
    deadConnectionDetected: false,
  }
  let targetPort = options.port ?? 0
  let error: string | null = null

  try {
    const target = await simulator.start()
    targetPort = target.port
    const clientOptions = { host, port: target.port, timeoutMs }

    firstClient = new SessionClient(clientOptions)
    await firstClient.connect()
    summary.connected = true
    const welcome = await firstClient.waitFor(
      (message) => message.name === 'jpl',
    )
    summary.welcomeReceived = Boolean(welcome.data.version)
    summary.logonPassed = await logon(firstClient)
    await firstClient.waitFor(
      (message) =>
        message.name === 'FcStatus_resp' && message.solicited === false,
    )
    summary.bootstrapStatusObserved = true

    await firstClient.waitFor((message) => message.name === 'heartbeat')
    summary.serverHeartbeatObserved = true
    firstClient.send({ name: 'heartbeat', subCode: '00H', data: {} })
    const heartbeatDeadline = Date.now() + timeoutMs
    while (
      simulator.getStats().receivedHeartbeats < 1 &&
      Date.now() < heartbeatDeadline
    ) {
      await delay(5)
    }
    summary.clientHeartbeatObserved =
      simulator.getStats().receivedHeartbeats >= 1

    firstTransaction = await readSupervisedTransaction(firstClient)
    const disconnected = simulator.disconnectClients()
    await firstClient.waitForClose()
    summary.forcedDisconnectObserved = disconnected === 1

    secondClient = new SessionClient(clientOptions)
    await secondClient.connect()
    await secondClient.waitFor((message) => message.name === 'jpl')
    summary.reconnected = await logon(secondClient)
    recoveredTransaction = await readSupervisedTransaction(secondClient)
    summary.transactionRecoveredAfterRestart = sameTransaction(
      firstTransaction,
      recoveredTransaction,
    )

    simulator.pauseHeartbeats()
    const lastMessageAt = secondClient.lastMessageAt
    await delay(deadConnectionTimeoutMs + 20)
    const liveness = evaluateJplConnectionLiveness({
      now: Date.now(),
      lastMessageAt,
      lastConnectAt: null,
      deadConnectionTimeoutMs,
    })
    summary.deadConnectionDetected = liveness.status === 'dead'
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    firstClient?.close()
    secondClient?.close()
    await simulator.stop()
  }

  const passed = Object.values(summary).every(Boolean) && !error
  return {
    generatedAt: new Date().toISOString(),
    mode: 'doms-jpl-session-resilience-self-test',
    status: passed ? 'passed' : 'failed',
    target: {
      host,
      port: targetPort,
      heartbeatMs,
      deadConnectionTimeoutMs,
    },
    summary,
    firstTransaction,
    recoveredTransaction,
    simulatorStats: simulator.getStats(),
    error,
  }
}
