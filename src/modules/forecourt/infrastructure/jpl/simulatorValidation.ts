import * as net from 'node:net'
import * as tls from 'node:tls'
import type {
  DomsJplSimulatorEnvelope,
  DomsJplSimulatorScenario,
} from '@/src/modules/forecourt/infrastructure/jpl/simulator'

import {
  encodeDomsJplFrame,
  extractDomsJplFrames,
} from '@/src/modules/forecourt/infrastructure/jpl/simulator'

type JsonObject = Record<string, unknown>

type SimulatorValidationSocket = net.Socket | tls.TLSSocket

export type DomsJplSimulatorValidationStatus = 'passed' | 'warning' | 'failed'

export type DomsJplSimulatorValidationOptions = {
  host?: string
  port?: number
  secure?: boolean
  rejectUnauthorized?: boolean
  scenario?: DomsJplSimulatorScenario
  timeoutMs?: number
  idleCollectMs?: number
  fcAccessCode?: string
  countryCode?: string
  posVersionId?: string
  verbose?: boolean
}

export type DomsJplSimulatorValidationStep = {
  id: string
  title: string
  request: DomsJplSimulatorEnvelope
  expectedNames: string[]
  critical?: boolean
  expectedReject?: boolean
}

export type DomsJplSimulatorValidationStepResult = {
  id: string
  title: string
  status: DomsJplSimulatorValidationStatus
  critical: boolean
  requestName: string
  expectedNames: string[]
  responseNames: string[]
  rejectInfoTexts: string[]
  durationMs: number
  error: string | null
  correlationId: string
}

export type DomsJplSimulatorValidationReport = {
  generatedAt: string
  target: {
    host: string
    port: number
    secure: boolean
    scenario: DomsJplSimulatorScenario
  }
  status: DomsJplSimulatorValidationStatus
  summary: {
    connected: boolean
    welcomeReceived: boolean
    logonPassed: boolean
    installStatusCaptured: boolean
    workflowsPassed: boolean
    pumpWorkflowPassed: boolean
    rejectPathPassed: boolean
    totalSteps: number
    passedSteps: number
    warningSteps: number
    failedSteps: number
    criticalFailedSteps: number
    startupUnsolicitedNames: string[]
  }
  steps: DomsJplSimulatorValidationStepResult[]
  fieldValidationEvidenceImport: JsonObject
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_TIMEOUT_MS = 2_000
const DEFAULT_IDLE_COLLECT_MS = 150
const DEFAULT_SCENARIO: DomsJplSimulatorScenario = 'full'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const positiveInt = (value: unknown, fallback: number, max = 300_000) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

const bool = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const countStatus = (
  results: DomsJplSimulatorValidationStepResult[],
  status: DomsJplSimulatorValidationStatus,
) => results.filter((entry) => entry.status === status).length

const makeCorrelationId = (id: string) =>
  `doms-jpl-sim-validation-${id}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

const expectedStatus = (passed: boolean, warningIfFalse = false) => {
  if (passed) return 'passed'
  return warningIfFalse ? 'warning' : 'blocked'
}

class DomsJplValidationClient {
  private socket: SimulatorValidationSocket | null = null
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private readonly queue: DomsJplSimulatorEnvelope[] = []
  private readonly waiters: Array<{
    predicate: (message: DomsJplSimulatorEnvelope) => boolean
    resolve: (message: DomsJplSimulatorEnvelope) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }> = []

  constructor(
    private readonly options: Required<
      Omit<
        DomsJplSimulatorValidationOptions,
        'fcAccessCode' | 'countryCode' | 'posVersionId'
      >
    >,
  ) {}

  async connect() {
    if (this.socket) return
    const socket = this.options.secure
      ? tls.connect({
          host: this.options.host,
          port: this.options.port,
          rejectUnauthorized: this.options.rejectUnauthorized,
        })
      : net.connect({ host: this.options.host, port: this.options.port })

    this.socket = socket

    socket.on('data', (chunk) => this.handleData(chunk))
    socket.on('close', () => this.rejectWaiters('Socket closed'))
    socket.on('error', (error) => this.rejectWaiters(error.message))

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error('Timed out while connecting to DOMS/JPL target')),
        this.options.timeoutMs,
      )
      const connectedEvent = this.options.secure ? 'secureConnect' : 'connect'
      socket.once(connectedEvent, () => {
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
    this.rejectWaiters('Validation client closed')
    this.socket?.destroy()
    this.socket = null
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
        reject(new Error('Timed out waiting for JPL response'))
      }, timeoutMs)
      this.waiters.push({ predicate, resolve, reject, timer })
    })
  }

  async collectFor(ms = this.options.idleCollectMs) {
    await delay(ms)
    return this.queue.splice(0)
  }

  send(message: DomsJplSimulatorEnvelope) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('DOMS/JPL validation socket is not connected')
    }
    if (this.options.verbose) {
      console.log(
        '[doms-jpl-sim-validate] request',
        message.name,
        message.subCode,
      )
    }
    this.socket.write(encodeDomsJplFrame(message))
  }

  private handleData(chunk: Buffer<ArrayBufferLike>) {
    const extracted = extractDomsJplFrames(Buffer.concat([this.buffer, chunk]))
    this.buffer = extracted.remainder

    for (const frame of extracted.frames) {
      if (!frame.message) continue
      if (this.options.verbose) {
        console.log(
          '[doms-jpl-sim-validate] response',
          frame.message.name,
          frame.message.subCode,
        )
      }
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

const makeRequest = (
  name: string,
  data: JsonObject = {},
  subCode = '00H',
): DomsJplSimulatorEnvelope => ({ name, subCode, data })

const baseValidationSteps = (): DomsJplSimulatorValidationStep[] => [
  {
    id: 'fc-status',
    title: 'Forecourt Controller status can be read',
    request: makeRequest('FcStatus_req'),
    expectedNames: ['FcStatus_resp'],
    critical: true,
  },
  {
    id: 'fc-install-status',
    title: 'DOMS installation snapshot can be read',
    request: makeRequest('FcInstallStatus_req'),
    expectedNames: ['FcInstallStatus_resp'],
    critical: true,
  },
  {
    id: 'pos-connection-status',
    title: 'POS connection status can be read',
    request: makeRequest('PosConnectionStatus_req'),
    expectedNames: ['PosConnectionStatus_resp'],
  },
  {
    id: 'pss-peripherals-status',
    title: 'PSS peripheral status can be read',
    request: makeRequest('PssPeripheralsStatus_req'),
    expectedNames: ['PssPeripheralsStatus_resp'],
  },
  {
    id: 'fp-status-all',
    title: 'All fuelling point statuses can be read as a multi-message',
    request: makeRequest('FpStatus_req', { FpId: '00' }),
    expectedNames: ['MultiMessage_resp', 'FpStatus_resp'],
    critical: true,
  },
  {
    id: 'fp-info',
    title: 'Fuelling point installation/runtime info can be read',
    request: makeRequest('FpInfo_req', { FpId: '01' }),
    expectedNames: ['FpInfo_resp'],
  },
  {
    id: 'safe-reject-path',
    title:
      'Unsupported requests return RejectMessage_resp instead of false success',
    request: makeRequest('Unsupported_req'),
    expectedNames: ['RejectMessage_resp'],
    expectedReject: true,
    critical: true,
  },
]

const specialRecordSteps = (): DomsJplSimulatorValidationStep[] => [
  {
    id: 'fc-service-log-read',
    title: 'Forecourt service-log buffer can be read',
    request: makeRequest('FcServiceMsg_req'),
    expectedNames: ['FcServiceMsg_resp'],
  },
  {
    id: 'bor-read',
    title: 'Back Office Record buffer can be read',
    request: makeRequest('BackOfficeRecord_req', {}, '02H'),
    expectedNames: ['BackOfficeRecord_resp'],
  },
  {
    id: 'client-data-read',
    title: 'Client-data backup can be read',
    request: makeRequest('ClientData_req', {
      PosId: '01',
      ClientDataOffset: 0,
      ClientDataLen: 4,
    }),
    expectedNames: ['ClientData_resp'],
  },
]

const transactionSteps = (): DomsJplSimulatorValidationStep[] => [
  {
    id: 'fp-supervised-transaction-read',
    title: 'Supervised transaction buffer can be read without clearing',
    request: makeRequest('FpSupTrans_req', {
      FpId: '01',
      PosId: '01',
      TransSeqNo: '0201',
    }),
    expectedNames: ['FpSupTrans_resp'],
    critical: true,
  },
  {
    id: 'fp-unsupervised-transaction-read',
    title: 'Unsupervised transaction buffer can be read without clearing',
    request: makeRequest('FpUnSupTrans_req', {
      FpId: '02',
      PosId: '00',
      TransSeqNo: '0301',
    }),
    expectedNames: ['FpUnSupTrans_resp'],
    critical: true,
  },
]

const wetstockSteps = (): DomsJplSimulatorValidationStep[] => [
  {
    id: 'tg-status-all',
    title: 'All tank gauge statuses can be read as a multi-message',
    request: makeRequest('TgStatus_req', { TgId: '00' }),
    expectedNames: ['MultiMessage_resp', 'TgStatus_resp'],
    critical: true,
  },
  {
    id: 'tg-data',
    title: 'Tank gauge data snapshot can be read',
    request: makeRequest('TgData_req', { TgId: '01' }),
    expectedNames: ['TgData_resp'],
    critical: true,
  },
  {
    id: 'site-delivery-status',
    title: 'Site delivery status can be read',
    request: makeRequest('SiteDeliveryStatus_req'),
    expectedNames: ['SiteDeliveryStatus_resp'],
  },
  {
    id: 'tank-delivery-data',
    title: 'Tank delivery data can be read without clearing',
    request: makeRequest('TankDeliveryData_req', {
      TgId: '01',
      TankDeliverySeqNo: '01',
    }),
    expectedNames: ['TankDeliveryData_resp'],
  },
]

const optionalModuleSteps = (): DomsJplSimulatorValidationStep[] => [
  {
    id: 'price-pole-status',
    title: 'Price pole status can be read',
    request: makeRequest('PpStatus_req', { PpId: '01' }),
    expectedNames: ['PpStatus_resp'],
  },
  {
    id: 'wash-status',
    title: 'Wash point status can be read',
    request: makeRequest('WpStatus_req', { WpId: '01' }),
    expectedNames: ['WpStatus_resp'],
  },
  {
    id: 'wash-transaction-read',
    title: 'Wash transaction buffer can be read without clearing',
    request: makeRequest('WpUnSupTrans_req', {
      WpId: '01',
      PosId: '00',
      TransSeqNo: '0401',
    }),
    expectedNames: ['WpUnSupTrans_resp'],
  },
  {
    id: 'digital-io-status',
    title: 'Digital I/O status can be read',
    request: makeRequest('DiopStatus_req', { DiopId: '01' }),
    expectedNames: ['DiopStatus_resp'],
  },
  {
    id: 'sensor-status',
    title: 'Sensor status can be read',
    request: makeRequest('SensorStatus_req', { SensorId: '01' }),
    expectedNames: ['SensorStatus_resp'],
  },
  {
    id: 'vending-status',
    title: 'Vending machine status can be read',
    request: makeRequest('VmStatus_req', { VmId: '01' }),
    expectedNames: ['VmStatus_resp'],
  },
  {
    id: 'vending-totals',
    title: 'Vending drystock totals can be read',
    request: makeRequest('VmDrystockTotals_req', {
      VmId: '01',
      VmTotalType: '01H',
    }),
    expectedNames: ['VmDrystockTotals_resp'],
  },
]

export const getDomsJplSimulatorValidationSteps = (
  scenario: DomsJplSimulatorScenario = DEFAULT_SCENARIO,
) => {
  const steps = [...baseValidationSteps()]
  if (scenario !== 'minimal') steps.push(...specialRecordSteps())
  if (scenario === 'transaction-recovery' || scenario === 'full') {
    steps.push(...transactionSteps())
  }
  if (scenario === 'wetstock' || scenario === 'full')
    steps.push(...wetstockSteps())
  if (scenario === 'optional-modules' || scenario === 'full') {
    steps.push(...optionalModuleSteps())
  }
  return steps
}

const runStep = async (
  client: DomsJplValidationClient,
  step: DomsJplSimulatorValidationStep,
  timeoutMs: number,
): Promise<DomsJplSimulatorValidationStepResult> => {
  const correlationId = makeCorrelationId(step.id)
  const request: DomsJplSimulatorEnvelope = {
    ...step.request,
    correlationId,
  }
  const startedAt = Date.now()
  try {
    client.send(request)
    const response = await client.waitFor(
      (message) =>
        message.correlationId === correlationId &&
        (step.expectedNames.includes(message.name) ||
          message.name === 'RejectMessage_resp'),
      timeoutMs,
    )
    const responseNames = [response.name]
    const rejectInfoTexts =
      response.name === 'RejectMessage_resp'
        ? [String(response.data?.RejectInfoText ?? '')].filter(Boolean)
        : []
    const isExpected = step.expectedNames.includes(response.name)
    const isUnexpectedReject =
      response.name === 'RejectMessage_resp' && step.expectedReject !== true
    return {
      id: step.id,
      title: step.title,
      status: isExpected && !isUnexpectedReject ? 'passed' : 'failed',
      critical: step.critical === true,
      requestName: step.request.name,
      expectedNames: step.expectedNames,
      responseNames,
      rejectInfoTexts,
      durationMs: Date.now() - startedAt,
      error:
        isExpected && !isUnexpectedReject
          ? null
          : `Expected ${step.expectedNames.join(' or ')}, received ${response.name}`,
      correlationId,
    }
  } catch (error) {
    return {
      id: step.id,
      title: step.title,
      status: 'failed',
      critical: step.critical === true,
      requestName: step.request.name,
      expectedNames: step.expectedNames,
      responseNames: [],
      rejectInfoTexts: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      correlationId,
    }
  }
}

const buildEvidenceImport = (report: {
  generatedAt: string
  target: DomsJplSimulatorValidationReport['target']
  summary: DomsJplSimulatorValidationReport['summary']
  steps: DomsJplSimulatorValidationStepResult[]
}) => ({
  action: 'import',
  evidenceType: 'jpl-simulator',
  sourceSystem: 'doms-jpl-simulator-validation-runner',
  observedAt: report.generatedAt,
  note: 'Generated by npm run doms:jpl-sim:validate. This is simulator evidence only and does not prove live DOMS/PSS controller acceptance.',
  evidenceReference: `doms-jpl-simulator://${report.target.host}:${report.target.port}/${report.target.scenario}`,
  confirmNoPssWrite: true,
  confirmManualValidation: true,
  results: {
    connected: report.summary.connected,
    logonPassed: report.summary.logonPassed,
    installStatusCaptured: report.summary.installStatusCaptured,
    workflowsPassed: report.summary.workflowsPassed,
    pumpWorkflowPassed: report.summary.pumpWorkflowPassed,
    rejectPathPassed: report.summary.rejectPathPassed,
    scenario: report.target.scenario,
    target: report.target,
    totalSteps: report.summary.totalSteps,
    passedSteps: report.summary.passedSteps,
    failedSteps: report.summary.failedSteps,
    startupUnsolicitedNames: report.summary.startupUnsolicitedNames,
  },
  checkpoints: [
    {
      checklistItemId: 'jpl-live-connection-observed',
      status: expectedStatus(
        report.summary.connected && report.summary.logonPassed,
      ),
      note: report.summary.logonPassed
        ? 'Simulator socket, JPL welcome, and FcLogon response were observed.'
        : 'Simulator connection or logon did not complete.',
      evidence: {
        welcomeReceived: report.summary.welcomeReceived,
        logonPassed: report.summary.logonPassed,
      },
    },
    {
      checklistItemId: 'fc-install-status-snapshot-captured',
      status: expectedStatus(report.summary.installStatusCaptured, true),
      note: report.summary.installStatusCaptured
        ? 'FcInstallStatus_resp was captured during simulator validation.'
        : 'FcInstallStatus_resp was not captured during simulator validation.',
      evidence: {
        stepId: 'fc-install-status',
      },
    },
    {
      checklistItemId: 'production-workflows-exercised',
      status: expectedStatus(report.summary.workflowsPassed, true),
      note: report.summary.workflowsPassed
        ? 'All critical simulator workflow checks passed.'
        : 'One or more critical simulator workflow checks failed or timed out.',
      evidence: {
        criticalFailedSteps: report.summary.criticalFailedSteps,
        failedStepIds: report.steps
          .filter((step) => step.status === 'failed')
          .map((step) => step.id),
      },
    },
  ],
})

export async function validateDomsJplSimulatorScenario(
  input: DomsJplSimulatorValidationOptions = {},
): Promise<DomsJplSimulatorValidationReport> {
  const scenario = input.scenario ?? DEFAULT_SCENARIO
  const options = {
    host: input.host ?? DEFAULT_HOST,
    port: positiveInt(input.port, input.secure ? 8889 : 8888, 65535),
    secure: bool(input.secure),
    rejectUnauthorized: bool(input.rejectUnauthorized),
    scenario,
    timeoutMs: positiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS),
    idleCollectMs: positiveInt(input.idleCollectMs, DEFAULT_IDLE_COLLECT_MS),
    verbose: bool(input.verbose),
  }
  const client = new DomsJplValidationClient(options)
  const steps = getDomsJplSimulatorValidationSteps(scenario)
  const results: DomsJplSimulatorValidationStepResult[] = []
  const target = {
    host: options.host,
    port: options.port,
    secure: options.secure,
    scenario,
  }
  const generatedAt = new Date().toISOString()
  let welcomeReceived = false
  let logonPassed = false
  let startupUnsolicitedNames: string[] = []

  try {
    await client.connect()
    const welcome = await client.waitFor(
      (message) => message.name === 'jpl',
      options.timeoutMs,
    )
    welcomeReceived = welcome.name === 'jpl'

    const logonCorrelationId = makeCorrelationId('logon')
    client.send({
      name: 'FcLogon_req',
      subCode: '01H',
      correlationId: logonCorrelationId,
      data: {
        FcAccessCode:
          input.fcAccessCode ??
          'POS,RI,UNSO_FPSTA_3,UNSO_TRBUFSTA_3,UNSO_INSTSTA_1',
        CountryCode: input.countryCode ?? '0710',
        PosVersionId: input.posVersionId ?? 'vpos-simulator-validation',
      },
    })
    const logon = await client.waitFor(
      (message) =>
        message.correlationId === logonCorrelationId &&
        (message.name === 'FcLogon_resp' ||
          message.name === 'RejectMessage_resp'),
      options.timeoutMs,
    )
    logonPassed = logon.name === 'FcLogon_resp'
    startupUnsolicitedNames = (
      await client.collectFor(options.idleCollectMs)
    ).map((message) => message.name)

    for (const step of steps) {
      results.push(await runStep(client, step, options.timeoutMs))
    }
  } catch (error) {
    results.push({
      id: 'connection-bootstrap',
      title: 'JPL connection, welcome, and logon bootstrap',
      status: 'failed',
      critical: true,
      requestName: 'FcLogon_req',
      expectedNames: ['jpl', 'FcLogon_resp'],
      responseNames: [],
      rejectInfoTexts: [],
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
      correlationId: 'connection-bootstrap',
    })
  } finally {
    client.close()
  }

  const failedSteps = countStatus(results, 'failed')
  const warningSteps = countStatus(results, 'warning')
  const criticalFailedSteps = results.filter(
    (step) => step.critical && step.status === 'failed',
  ).length
  const installStatusCaptured = results.some(
    (step) => step.id === 'fc-install-status' && step.status === 'passed',
  )
  const rejectPathPassed = results.some(
    (step) => step.id === 'safe-reject-path' && step.status === 'passed',
  )
  const pumpWorkflowPassed = results
    .filter((step) => step.id.startsWith('fp-'))
    .every((step) => step.status === 'passed')
  const workflowsPassed = criticalFailedSteps === 0
  const summary = {
    connected: welcomeReceived && logonPassed,
    welcomeReceived,
    logonPassed,
    installStatusCaptured,
    workflowsPassed,
    pumpWorkflowPassed,
    rejectPathPassed,
    totalSteps: results.length,
    passedSteps: countStatus(results, 'passed'),
    warningSteps,
    failedSteps,
    criticalFailedSteps,
    startupUnsolicitedNames,
  }
  const status: DomsJplSimulatorValidationStatus = criticalFailedSteps
    ? 'failed'
    : failedSteps
      ? 'warning'
      : 'passed'

  const reportWithoutEvidence = {
    generatedAt,
    target,
    status,
    summary,
    steps: results,
  }

  return {
    ...reportWithoutEvidence,
    fieldValidationEvidenceImport: buildEvidenceImport(reportWithoutEvidence),
  }
}
