import * as net from 'node:net'
import * as tls from 'node:tls'
import type { DomsJplSimulatorEnvelope } from '@/src/modules/forecourt/infrastructure/jpl/simulator'

import { assessDomsJplLiveConformance } from '@/src/modules/forecourt/infrastructure/jpl/liveConformance'
import {
  encodeDomsJplFrame,
  extractDomsJplFrames,
} from '@/src/modules/forecourt/infrastructure/jpl/simulator'

export type DomsJplLiveValidationStatus = 'passed' | 'warning' | 'failed'

export type DomsJplLiveValidationProfile =
  | 'minimal-readonly'
  | 'dispense-readonly'
  | 'wetstock-readonly'
  | 'optional-readonly'
  | 'full-readonly'

export type DomsJplLiveValidationOptions = {
  host?: string
  port?: number
  secure?: boolean
  rejectUnauthorized?: boolean
  profile?: DomsJplLiveValidationProfile
  timeoutMs?: number
  idleCollectMs?: number
  fcAccessCode?: string
  countryCode?: string
  posVersionId?: string
  logonSubCode?: '00H' | '01H'
  includeRejectProbe?: boolean
  verbose?: boolean
  moneyDecimals?: number
  volumeDecimals?: number
}

export type DomsJplLiveValidationStep = {
  id: string
  title: string
  request: DomsJplSimulatorEnvelope
  expectedNames: string[]
  category:
    | 'bootstrap'
    | 'general'
    | 'dispense'
    | 'wetstock'
    | 'optional'
    | 'safety'
  critical?: boolean
  optional?: boolean
  expectedReject?: boolean
  readOnlyRiskNote?: string
  acceptedRejectInfoPatterns?: RegExp[]
  acceptStartupObservation?: boolean
}

export type DomsJplLiveValidationStepResult = {
  id: string
  title: string
  category: DomsJplLiveValidationStep['category']
  status: DomsJplLiveValidationStatus
  critical: boolean
  optional: boolean
  requestName: string
  requestSubCode: string
  expectedNames: string[]
  responseNames: string[]
  nestedResponseNames: string[]
  rejectInfoTexts: string[]
  durationMs: number
  error: string | null
  correlationId: string
  correlationMatch: 'matched' | 'absent' | 'not-applicable'
  readOnlyRiskNote: string | null
  operationalOutcome: string | null
  responseEnvelopes: DomsJplSimulatorEnvelope[]
}

export type DomsJplLiveValidationReport = {
  generatedAt: string
  mode: 'doms-jpl-live-readonly-validation'
  target: {
    host: string
    port: number
    secure: boolean
    profile: DomsJplLiveValidationProfile
  }
  status: DomsJplLiveValidationStatus
  summary: {
    connected: boolean
    sessionReady: boolean
    welcomeReceived: boolean
    welcomeVersion: string | null
    logonPassed: boolean
    installStatusCaptured: boolean
    workflowsPassed: boolean
    dispenseStatusCaptured: boolean
    wetstockStatusCaptured: boolean
    optionalStatusCaptured: boolean
    rejectProbePassed: boolean | null
    totalSteps: number
    passedSteps: number
    warningSteps: number
    failedSteps: number
    criticalFailedSteps: number
    startupUnsolicitedNames: string[]
    readOnlyCommandNames: string[]
  }
  diagnostics: {
    tcpConnected: boolean
    bytesReceived: number
    framesReceived: number
    parsedMessageNames: string[]
    frameErrors: string[]
    frameErrorDetails: Array<{
      error: string
      byteLength: number
      topLevelKeys: string[]
      detectedName: string | null
      detectedSubCode: string | null
      dataType: string
      preview: string
    }>
    queuedMessageNames: string[]
    uncorrelatedResponseFallbacks: number
  }
  safetyBoundary: {
    readOnlyOnly: true
    pssWritesAttempted: false
    transactionBufferReadsAttempted: false
    unsupportedRejectProbeAttempted: boolean
    note: string
  }
  steps: DomsJplLiveValidationStepResult[]
  protocolConformance: ReturnType<typeof assessDomsJplLiveConformance>
  fieldValidationEvidenceImport: Record<string, unknown>
}

type JsonObject = Record<string, unknown>
type LiveValidationSocket = net.Socket | tls.TLSSocket

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_TIMEOUT_MS = 3_000
const DEFAULT_IDLE_COLLECT_MS = 250
const DEFAULT_PROFILE: DomsJplLiveValidationProfile = 'minimal-readonly'
const DEFAULT_LOGON_SUBCODE = '00H' as const

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const positiveInt = (value: unknown, fallback: number, max = 300_000) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

const bool = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const normalizeProfile = (value: unknown): DomsJplLiveValidationProfile => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  switch (normalized) {
    case 'minimal-readonly':
    case 'dispense-readonly':
    case 'wetstock-readonly':
    case 'optional-readonly':
    case 'full-readonly':
      return normalized
    case 'minimal':
      return 'minimal-readonly'
    case 'dispense':
      return 'dispense-readonly'
    case 'wetstock':
      return 'wetstock-readonly'
    case 'optional':
    case 'optional-modules':
      return 'optional-readonly'
    case 'full':
      return 'full-readonly'
    default:
      return DEFAULT_PROFILE
  }
}

const makeCorrelationId = (id: string) =>
  `doms-jpl-live-validation-${id}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

const makeRequest = (
  name: string,
  data: JsonObject = {},
  subCode = '00H',
): DomsJplSimulatorEnvelope => ({ name, subCode, data })

const describeInvalidFrame = (raw: Buffer<ArrayBufferLike>, error: string) => {
  const text = raw.toString('utf8').slice(0, 512)
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    // Keep parsed null; preview remains sufficient for field diagnostics.
  }
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  const data = record?.data
  return {
    error,
    byteLength: raw.length,
    topLevelKeys: record ? Object.keys(record).sort() : [],
    detectedName: typeof record?.name === 'string' ? record.name : null,
    detectedSubCode:
      typeof record?.subCode === 'string' ? record.subCode : null,
    dataType: Array.isArray(data)
      ? 'array'
      : data === null
        ? 'null'
        : typeof data,
    preview: text.replace(/[\r\n\t]+/g, ' ').slice(0, 256),
  }
}

const extractNestedNames = (message: DomsJplSimulatorEnvelope) => {
  const messages = Array.isArray(message.data?.messages)
    ? (message.data.messages as Array<Record<string, unknown>>)
    : []
  return messages
    .map((entry) => String(entry?.name ?? '').trim())
    .filter(Boolean)
}

const countStatus = (
  results: DomsJplLiveValidationStepResult[],
  status: DomsJplLiveValidationStatus,
) => results.filter((entry) => entry.status === status).length

const expectedStatus = (passed: boolean, warningIfFalse = false) => {
  if (passed) return 'passed'
  return warningIfFalse ? 'warning' : 'blocked'
}

class DomsJplLiveValidationClient {
  private socket: LiveValidationSocket | null = null
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private readonly queue: DomsJplSimulatorEnvelope[] = []
  private readonly waiters: Array<{
    predicate: (message: DomsJplSimulatorEnvelope) => boolean
    resolve: (message: DomsJplSimulatorEnvelope) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }> = []
  private bytesReceived = 0
  private framesReceived = 0
  private uncorrelatedResponseFallbacks = 0
  private readonly parsedMessageNames: string[] = []
  private readonly frameErrors: string[] = []
  private readonly frameErrorDetails: Array<{
    error: string
    byteLength: number
    topLevelKeys: string[]
    detectedName: string | null
    detectedSubCode: string | null
    dataType: string
    preview: string
  }> = []

  constructor(
    private readonly options: {
      host: string
      port: number
      secure: boolean
      rejectUnauthorized: boolean
      timeoutMs: number
      idleCollectMs: number
      verbose: boolean
    },
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
    socket.on('data', (chunk: Buffer<ArrayBufferLike>) =>
      this.handleData(chunk),
    )
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
    this.rejectWaiters('Live validation client closed')
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

  getDiagnostics() {
    return {
      bytesReceived: this.bytesReceived,
      framesReceived: this.framesReceived,
      parsedMessageNames: [...this.parsedMessageNames],
      frameErrors: [...this.frameErrors],
      frameErrorDetails: [...this.frameErrorDetails],
      queuedMessageNames: this.queue.map((message) => message.name),
      uncorrelatedResponseFallbacks: this.uncorrelatedResponseFallbacks,
    }
  }

  noteUncorrelatedResponseFallback() {
    this.uncorrelatedResponseFallbacks += 1
  }

  send(message: DomsJplSimulatorEnvelope) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('DOMS/JPL validation socket is not connected')
    }
    if (this.options.verbose) {
      console.log(
        '[doms-jpl-live-validate] request',
        message.name,
        message.subCode,
      )
    }
    this.socket.write(encodeDomsJplFrame(message))
  }

  private handleData(chunk: Buffer<ArrayBufferLike>) {
    this.bytesReceived += chunk.length
    const extracted = extractDomsJplFrames(Buffer.concat([this.buffer, chunk]))
    this.buffer = extracted.remainder

    for (const frame of extracted.frames) {
      this.framesReceived += 1
      if (!frame.message) {
        if (frame.error) {
          this.frameErrors.push(frame.error)
          this.frameErrorDetails.push(
            describeInvalidFrame(frame.raw, frame.error),
          )
        }
        continue
      }
      this.parsedMessageNames.push(frame.message.name)
      if (this.options.verbose) {
        console.log(
          '[doms-jpl-live-validate] response',
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

const hasCorrelationId = (message: DomsJplSimulatorEnvelope) =>
  Object.prototype.hasOwnProperty.call(message, 'correlationId')

const isSolicitedResponse = (message: DomsJplSimulatorEnvelope) =>
  message.solicited !== false

const responseMatchesRequest = (
  message: DomsJplSimulatorEnvelope,
  correlationId: string,
  expectedNames: string[],
) => {
  if (!isSolicitedResponse(message)) return false
  if (
    !expectedNames.includes(message.name) &&
    message.name !== 'RejectMessage_resp'
  ) {
    return false
  }

  if (!hasCorrelationId(message)) return true
  return message.correlationId === correlationId
}

const correlationMatchFor = (
  message: DomsJplSimulatorEnvelope,
  correlationId: string,
): DomsJplLiveValidationStepResult['correlationMatch'] => {
  if (!hasCorrelationId(message)) return 'absent'
  return message.correlationId === correlationId ? 'matched' : 'not-applicable'
}

const baseReadOnlySteps = (): DomsJplLiveValidationStep[] => [
  {
    id: 'fc-status',
    title: 'Forecourt Controller status can be read',
    request: makeRequest('FcStatus_req'),
    expectedNames: ['FcStatus_resp'],
    category: 'general',
    critical: true,
  },
  {
    id: 'fc-install-status',
    title: 'DOMS installation snapshot can be read',
    request: makeRequest('FcInstallStatus_req'),
    expectedNames: ['FcInstallStatus_resp'],
    category: 'general',
    critical: true,
  },
  {
    id: 'fc-date-time',
    title: 'Forecourt Controller date/time can be read',
    request: makeRequest('FcDateAndTime_req'),
    expectedNames: ['FcDateAndTime_resp'],
    category: 'general',
  },
  {
    id: 'pos-connection-status',
    title: 'POS connection status can be read',
    request: makeRequest('PosConnectionStatus_req'),
    expectedNames: ['PosConnectionStatus_resp'],
    category: 'general',
  },
  {
    id: 'pss-peripherals-status',
    title: 'PSS peripheral status can be read',
    request: makeRequest('PssPeripheralsStatus_req'),
    expectedNames: ['PssPeripheralsStatus_resp'],
    category: 'general',
  },
]

const dispenseReadOnlySteps = (): DomsJplLiveValidationStep[] => [
  {
    id: 'fp-status-all',
    title: 'All fuelling point statuses can be read',
    request: makeRequest('FpStatus_req', { FpId: '00' }),
    expectedNames: ['MultiMessage_resp', 'FpStatus_resp'],
    category: 'dispense',
    critical: true,
  },
  {
    id: 'fp-info',
    title: 'Fuelling point runtime info can be read for FpId 01',
    request: makeRequest(
      'FpInfo_req',
      { FpId: '01', FpInfoParId: ['02'] },
      '01H',
    ),
    expectedNames: ['FpInfo_resp'],
    category: 'dispense',
  },
  {
    id: 'fp-fuelling-data',
    title: 'Current fuelling data can be read for FpId 01',
    request: makeRequest('FpFuellingData_req', { FpId: '01' }, '01H'),
    expectedNames: ['FpFuellingData_resp'],
    category: 'dispense',
    acceptedRejectInfoPatterns: [/not fuelling/i, /no current trans/i],
  },
  {
    id: 'fp-error-message',
    title: 'Fuelling point error information can be read for FpId 01',
    request: makeRequest('FpErrorMsg_req', { FpId: '01' }),
    expectedNames: ['FpErrorMsg_resp'],
    category: 'dispense',
    optional: true,
  },
]

const wetstockReadOnlySteps = (): DomsJplLiveValidationStep[] => [
  {
    id: 'tg-status-all',
    title: 'All tank gauge statuses can be read',
    request: makeRequest('TgStatus_req', { TgId: '00' }),
    expectedNames: ['MultiMessage_resp', 'TgStatus_resp'],
    category: 'wetstock',
    critical: true,
  },
  {
    id: 'tg-data',
    title: 'Tank gauge data can be read for TgId 01',
    request: makeRequest('TgData_req', {
      TgId: '01',
      TankDataItemId: ['01', '02', '03', '04', '05', '06', '07', '08'],
    }),
    expectedNames: ['TgData_resp'],
    category: 'wetstock',
    critical: true,
  },
  {
    id: 'tank-control-status',
    title: 'Tank controller status can be read',
    request: makeRequest('TankControlStatus_req', { TankId: '00' }),
    expectedNames: ['TankControlStatus_resp'],
    category: 'wetstock',
    acceptStartupObservation: true,
  },
  {
    id: 'site-delivery-status',
    title: 'Site delivery status can be read',
    request: makeRequest('SiteDeliveryStatus_req'),
    expectedNames: ['SiteDeliveryStatus_resp'],
    category: 'wetstock',
  },
]

const optionalReadOnlySteps = (): DomsJplLiveValidationStep[] => [
  {
    id: 'price-pole-status',
    title: 'Price pole status can be read for PpId 01',
    request: makeRequest('PpStatus_req', { PpId: '01' }),
    expectedNames: ['PpStatus_resp'],
    category: 'optional',
    optional: true,
  },
  {
    id: 'wash-status',
    title: 'Wash point status can be read for WpId 01',
    request: makeRequest('WpStatus_req', { WpId: '01' }),
    expectedNames: ['WpStatus_resp'],
    category: 'optional',
    optional: true,
  },
  {
    id: 'digital-io-status',
    title: 'Digital I/O status can be read for DiopId 01',
    request: makeRequest('DiopStatus_req', { DiopId: '01' }),
    expectedNames: ['DiopStatus_resp'],
    category: 'optional',
    optional: true,
  },
  {
    id: 'sensor-status',
    title: 'Sensor status can be read for SensorId 01',
    request: makeRequest('SensorStatus_req', { SensorId: '01' }),
    expectedNames: ['SensorStatus_resp'],
    category: 'optional',
    optional: true,
  },
  {
    id: 'vending-status',
    title: 'Vending machine status can be read for VmId 01',
    request: makeRequest('VmStatus_req', { VmId: '01' }),
    expectedNames: ['VmStatus_resp'],
    category: 'optional',
    optional: true,
  },
]

export const getDomsJplLiveValidationSteps = (
  profile: DomsJplLiveValidationProfile = DEFAULT_PROFILE,
  includeRejectProbe = false,
) => {
  const steps = [...baseReadOnlySteps()]
  if (profile === 'dispense-readonly' || profile === 'full-readonly') {
    steps.push(...dispenseReadOnlySteps())
  }
  if (profile === 'wetstock-readonly' || profile === 'full-readonly') {
    steps.push(...wetstockReadOnlySteps())
  }
  if (profile === 'optional-readonly' || profile === 'full-readonly') {
    steps.push(...optionalReadOnlySteps())
  }
  if (includeRejectProbe) {
    steps.push({
      id: 'safe-reject-path',
      title: 'Unsupported request receives RejectMessage_resp',
      request: makeRequest('Unsupported_req'),
      expectedNames: ['RejectMessage_resp'],
      category: 'safety',
      expectedReject: true,
      optional: true,
      readOnlyRiskNote:
        'This sends an intentionally unsupported request to validate reject handling; leave disabled unless the field engineer approves the probe.',
    })
  }
  return steps
}

const runStep = async (
  client: DomsJplLiveValidationClient,
  step: DomsJplLiveValidationStep,
  timeoutMs: number,
): Promise<DomsJplLiveValidationStepResult> => {
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
        responseMatchesRequest(message, correlationId, step.expectedNames),
      timeoutMs,
    )
    const correlationMatch = correlationMatchFor(response, correlationId)
    if (correlationMatch === 'absent') {
      client.noteUncorrelatedResponseFallback()
    }
    const nestedResponseNames = extractNestedNames(response)
    const responseNames = [response.name]
    const rejectInfoTexts =
      response.name === 'RejectMessage_resp'
        ? [String(response.data?.RejectInfoText ?? '')].filter(Boolean)
        : []
    const isExpected =
      step.expectedNames.includes(response.name) ||
      nestedResponseNames.some((name) => step.expectedNames.includes(name))
    const acceptedOperationalReject =
      response.name === 'RejectMessage_resp' &&
      step.expectedReject !== true &&
      rejectInfoTexts.some((text) =>
        step.acceptedRejectInfoPatterns?.some((pattern) => pattern.test(text)),
      )
    const isUnexpectedReject =
      response.name === 'RejectMessage_resp' &&
      step.expectedReject !== true &&
      !acceptedOperationalReject
    const failed =
      (!isExpected && !acceptedOperationalReject) || isUnexpectedReject
    return {
      id: step.id,
      title: step.title,
      category: step.category,
      status: failed ? (step.optional ? 'warning' : 'failed') : 'passed',
      critical: step.critical === true,
      optional: step.optional === true,
      requestName: step.request.name,
      requestSubCode: step.request.subCode,
      expectedNames: step.expectedNames,
      responseNames,
      nestedResponseNames,
      rejectInfoTexts,
      durationMs: Date.now() - startedAt,
      error: failed
        ? rejectInfoTexts[0] ||
          `Expected ${step.expectedNames.join(' or ')}, received ${response.name}`
        : null,
      correlationId,
      correlationMatch,
      readOnlyRiskNote: step.readOnlyRiskNote ?? null,
      operationalOutcome: acceptedOperationalReject
        ? rejectInfoTexts[0] ||
          'Controller reported no current operational data.'
        : null,
      responseEnvelopes: [response],
    }
  } catch (error) {
    return {
      id: step.id,
      title: step.title,
      category: step.category,
      status: step.optional ? 'warning' : 'failed',
      critical: step.critical === true,
      optional: step.optional === true,
      requestName: step.request.name,
      requestSubCode: step.request.subCode,
      expectedNames: step.expectedNames,
      responseNames: [],
      nestedResponseNames: [],
      rejectInfoTexts: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      correlationId,
      correlationMatch: 'not-applicable',
      readOnlyRiskNote: step.readOnlyRiskNote ?? null,
      operationalOutcome: null,
      responseEnvelopes: [],
    }
  }
}

const buildEvidenceImport = (report: {
  generatedAt: string
  target: DomsJplLiveValidationReport['target']
  summary: DomsJplLiveValidationReport['summary']
  safetyBoundary: DomsJplLiveValidationReport['safetyBoundary']
  diagnostics: DomsJplLiveValidationReport['diagnostics']
  steps: DomsJplLiveValidationStepResult[]
  protocolConformance: ReturnType<typeof assessDomsJplLiveConformance>
}) => ({
  action: 'import',
  evidenceType: 'live-controller',
  sourceSystem: 'doms-jpl-live-readonly-validation-runner',
  observedAt: report.generatedAt,
  note: 'Generated by the DOMS/JPL live read-only validation runner. The runner sends status/read requests only and does not clear transactions, authorize pumps, or modify PSS configuration.',
  evidenceReference: `doms-jpl-live-readonly://${report.target.host}:${report.target.port}/${report.target.profile}`,
  confirmNoPssWrite: true,
  confirmManualValidation: false,
  requiresManualConfirmation: true,
  results: {
    connected: report.summary.connected,
    logonPassed: report.summary.logonPassed,
    installStatusCaptured: report.summary.installStatusCaptured,
    workflowsPassed: report.summary.workflowsPassed,
    fpStatusParserValidated:
      report.protocolConformance.summary.fpStatusParserValidated,
    valueNormalizationValidated:
      report.protocolConformance.summary.valueNormalizationValidated,
    protocolConformance: report.protocolConformance,
    dispenseStatusCaptured: report.summary.dispenseStatusCaptured,
    wetstockStatusCaptured: report.summary.wetstockStatusCaptured,
    optionalStatusCaptured: report.summary.optionalStatusCaptured,
    profile: report.target.profile,
    target: report.target,
    diagnostics: report.diagnostics,
    safetyBoundary: report.safetyBoundary,
    totalSteps: report.summary.totalSteps,
    passedSteps: report.summary.passedSteps,
    failedSteps: report.summary.failedSteps,
    startupUnsolicitedNames: report.summary.startupUnsolicitedNames,
    readOnlyCommandNames: report.summary.readOnlyCommandNames,
  },
  checkpoints: [
    {
      checklistItemId: 'jpl-live-connection-observed',
      status: expectedStatus(
        report.summary.connected && report.summary.logonPassed,
      ),
      note: report.summary.logonPassed
        ? 'Live socket, JPL welcome, and FcLogon response were observed by the read-only validator.'
        : 'Live JPL connection or logon did not complete.',
      evidence: {
        welcomeReceived: report.summary.welcomeReceived,
        logonPassed: report.summary.logonPassed,
        target: report.target,
      },
    },
    {
      checklistItemId: 'fc-install-status-snapshot-captured',
      status: expectedStatus(report.summary.installStatusCaptured, true),
      note: report.summary.installStatusCaptured
        ? 'FcInstallStatus_resp was captured from the target controller.'
        : 'FcInstallStatus_resp was not captured from the target controller.',
      evidence: { stepId: 'fc-install-status' },
    },
    {
      checklistItemId: 'production-workflows-exercised',
      status: expectedStatus(report.summary.workflowsPassed, true),
      note: report.summary.workflowsPassed
        ? 'Critical read-only DOMS/JPL workflow checks passed on the target controller.'
        : 'One or more critical read-only workflow checks failed or timed out.',
      evidence: {
        profile: report.target.profile,
        criticalFailedSteps: report.summary.criticalFailedSteps,
        failedStepIds: report.steps
          .filter((step) => step.status === 'failed')
          .map((step) => step.id),
        warningStepIds: report.steps
          .filter((step) => step.status === 'warning')
          .map((step) => step.id),
      },
    },
    {
      checklistItemId: 'jpl-live-fp-status-conformance-validated',
      status: expectedStatus(
        report.protocolConformance.summary.fpStatusParserValidated,
      ),
      note: report.protocolConformance.summary.fpStatusParserValidated
        ? 'Live FpStatus payloads passed parser and normalization conformance checks.'
        : 'Live FpStatus payloads were missing, malformed, or failed normalization checks.',
      evidence: {
        protocolConformanceStatus: report.protocolConformance.status,
        fpStatusObservationCount:
          report.protocolConformance.summary.fpStatusMessages,
        findingCodes: report.protocolConformance.findings.map(
          (finding) => finding.code,
        ),
      },
    },
    {
      checklistItemId: 'jpl-live-value-normalization-validated',
      status: expectedStatus(
        report.protocolConformance.summary.valueNormalizationValidated,
      ),
      note: report.protocolConformance.summary.valueNormalizationValidated
        ? 'Live money and volume values passed explicit decimal-scaling checks.'
        : 'Live money and volume values were missing, non-numeric, or could not be validated with the configured decimal positions.',
      evidence: {
        valueObservationCount:
          report.protocolConformance.summary.fuellingDataMessages,
        moneyDecimals:
          report.protocolConformance.valueObservations.find(
            (observation) => observation.kind === 'money',
          )?.decimals ?? null,
        volumeDecimals:
          report.protocolConformance.valueObservations.find(
            (observation) => observation.kind === 'volume',
          )?.decimals ?? null,
        findingCodes: report.protocolConformance.findings.map(
          (finding) => finding.code,
        ),
      },
    },
  ],
})

export async function validateDomsJplLiveReadOnlyTarget(
  input: DomsJplLiveValidationOptions = {},
): Promise<DomsJplLiveValidationReport> {
  const profile = normalizeProfile(input.profile)
  const logonSubCode =
    input.logonSubCode === '01H' ? '01H' : DEFAULT_LOGON_SUBCODE
  const options = {
    host: input.host ?? DEFAULT_HOST,
    port: positiveInt(input.port, input.secure ? 8889 : 8888, 65_535),
    secure: bool(input.secure),
    rejectUnauthorized: bool(input.rejectUnauthorized),
    profile,
    timeoutMs: positiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS),
    idleCollectMs: positiveInt(input.idleCollectMs, DEFAULT_IDLE_COLLECT_MS),
    includeRejectProbe: bool(input.includeRejectProbe),
    verbose: bool(input.verbose),
    moneyDecimals: input.moneyDecimals,
    volumeDecimals: input.volumeDecimals,
  }
  const client = new DomsJplLiveValidationClient(options)
  const steps = getDomsJplLiveValidationSteps(
    profile,
    options.includeRejectProbe,
  )
  const results: DomsJplLiveValidationStepResult[] = []
  const target = {
    host: options.host,
    port: options.port,
    secure: options.secure,
    profile,
  }
  const generatedAt = new Date().toISOString()
  const bootstrapStartedAt = Date.now()
  let tcpConnected = false
  let welcomeReceived = false
  let welcomeVersion: string | null = null
  let logonPassed = false
  let startupUnsolicitedNames: string[] = []
  let startupMessages: DomsJplSimulatorEnvelope[] = []
  let bootstrapRecorded = false

  try {
    await client.connect()
    tcpConnected = true
    const welcome = await client.waitFor(
      (message) => message.name === 'jpl',
      options.timeoutMs,
    )
    welcomeReceived = welcome.name === 'jpl'
    welcomeVersion = String(welcome.data?.version ?? '').trim() || null

    const logonCorrelationId = makeCorrelationId('logon')
    const logonData: JsonObject = {
      FcAccessCode:
        input.fcAccessCode ??
        'POS,RI,UNSO_FPSTA_3,UNSO_TRBUFSTA_3,UNSO_INSTSTA_1,UNSO_TGSTA_1,UNSO_DELIVSTA_1,UNSO_PRISTA_1',
      CountryCode: input.countryCode ?? '0710',
      PosVersionId: input.posVersionId ?? '470-02-1.08',
    }
    if (logonSubCode === '01H') {
      logonData.FcLogonPars = { UnsolMsgList: [] }
    }

    // FcLogon is the first application request on a serialized session. Some
    // deployed JTM versions accept correlation IDs only after logon, so keep
    // this bootstrap request to the baseline protocol shape.
    const logonWait = client.waitFor(
      (message) =>
        isSolicitedResponse(message) &&
        (message.name === 'FcLogon_resp' ||
          message.name === 'RejectMessage_resp'),
      options.timeoutMs,
    )
    client.send({
      name: 'FcLogon_req',
      subCode: logonSubCode,
      data: logonData,
    })
    const logon = await logonWait
    const logonCorrelationMatch: DomsJplLiveValidationStepResult['correlationMatch'] =
      'absent'
    client.noteUncorrelatedResponseFallback()
    logonPassed = logon.name === 'FcLogon_resp'
    const logonRejectInfoTexts =
      logon.name === 'RejectMessage_resp'
        ? [String(logon.data?.RejectInfoText ?? '')].filter(Boolean)
        : []
    results.push({
      id: 'connection-bootstrap',
      title: 'JPL connection, welcome, and logon bootstrap',
      category: 'bootstrap',
      status: logonPassed ? 'passed' : 'failed',
      critical: true,
      optional: false,
      requestName: 'FcLogon_req',
      requestSubCode: logonSubCode,
      expectedNames: ['jpl', 'FcLogon_resp'],
      responseNames: ['jpl', logon.name],
      nestedResponseNames: [],
      rejectInfoTexts: logonRejectInfoTexts,
      durationMs: Date.now() - bootstrapStartedAt,
      error: logonPassed
        ? null
        : logonRejectInfoTexts[0] ||
          `Expected FcLogon_resp, received ${logon.name}`,
      correlationId: logonCorrelationId,
      correlationMatch: logonCorrelationMatch,
      readOnlyRiskNote: null,
      operationalOutcome: null,
      responseEnvelopes: [welcome, logon],
    })
    bootstrapRecorded = true

    if (!logonPassed) {
      throw new Error(
        logonRejectInfoTexts[0] || `FcLogon was rejected by ${logon.name}`,
      )
    }
    startupMessages = await client.collectFor(options.idleCollectMs)
    startupUnsolicitedNames = startupMessages.map((message) => message.name)

    for (const step of steps) {
      const startupResponseName = step.acceptStartupObservation
        ? step.expectedNames.find((name) =>
            startupUnsolicitedNames.includes(name),
          )
        : undefined

      if (startupResponseName) {
        results.push({
          id: step.id,
          title: step.title,
          category: step.category,
          status: 'passed',
          critical: step.critical === true,
          optional: step.optional === true,
          requestName: step.request.name,
          requestSubCode: step.request.subCode,
          expectedNames: step.expectedNames,
          responseNames: [startupResponseName],
          nestedResponseNames: [],
          rejectInfoTexts: [],
          durationMs: 0,
          error: null,
          correlationId: 'startup-observation',
          correlationMatch: 'not-applicable',
          readOnlyRiskNote: step.readOnlyRiskNote ?? null,
          operationalOutcome:
            'Validated from an unsolicited controller response observed immediately after logon.',
          responseEnvelopes: startupMessages
            .filter((message) => message.name === startupResponseName)
            .slice(0, 1),
        })
        continue
      }

      results.push(await runStep(client, step, options.timeoutMs))
    }
  } catch (error) {
    if (!bootstrapRecorded) {
      const diagnostics = client.getDiagnostics()
      results.push({
        id: 'connection-bootstrap',
        title: 'JPL connection, welcome, and logon bootstrap',
        category: 'bootstrap',
        status: 'failed',
        critical: true,
        optional: false,
        requestName: 'FcLogon_req',
        requestSubCode: logonSubCode,
        expectedNames: ['jpl', 'FcLogon_resp'],
        responseNames: diagnostics.parsedMessageNames,
        nestedResponseNames: [],
        rejectInfoTexts: [],
        durationMs: Date.now() - bootstrapStartedAt,
        error: error instanceof Error ? error.message : String(error),
        correlationId: 'connection-bootstrap',
        correlationMatch: 'not-applicable',
        readOnlyRiskNote: null,
        operationalOutcome: null,
        responseEnvelopes: [],
      })
    }
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
  const dispenseStatusCaptured = results.some(
    (step) => step.category === 'dispense' && step.status === 'passed',
  )
  const wetstockStatusCaptured = results.some(
    (step) => step.category === 'wetstock' && step.status === 'passed',
  )
  const optionalStatusCaptured = results.some(
    (step) => step.category === 'optional' && step.status === 'passed',
  )
  const rejectProbeResult = results.find(
    (step) => step.id === 'safe-reject-path',
  )
  const rejectProbePassed = rejectProbeResult
    ? rejectProbeResult.status === 'passed'
    : null
  const workflowsPassed = criticalFailedSteps === 0
  const diagnosticsSnapshot = client.getDiagnostics()
  const sessionReady = welcomeReceived && logonPassed
  const summary = {
    connected: tcpConnected,
    sessionReady,
    welcomeReceived,
    welcomeVersion,
    logonPassed,
    installStatusCaptured,
    workflowsPassed,
    dispenseStatusCaptured,
    wetstockStatusCaptured,
    optionalStatusCaptured,
    rejectProbePassed,
    totalSteps: results.length,
    passedSteps: countStatus(results, 'passed'),
    warningSteps,
    failedSteps,
    criticalFailedSteps,
    startupUnsolicitedNames,
    readOnlyCommandNames: steps.map((step) => step.request.name),
  }
  const diagnostics = {
    tcpConnected,
    ...diagnosticsSnapshot,
  }
  const safetyBoundary = {
    readOnlyOnly: true as const,
    pssWritesAttempted: false as const,
    transactionBufferReadsAttempted: false as const,
    unsupportedRejectProbeAttempted: options.includeRejectProbe,
    note: 'Live validator sends status/read requests only. It deliberately excludes transaction-buffer reads, clears, authorizations, resets, price changes, dynamic tank writes, maintenance writes, and install/clear-install commands.',
  }
  const status: DomsJplLiveValidationStatus = criticalFailedSteps
    ? 'failed'
    : failedSteps || warningSteps
      ? 'warning'
      : 'passed'
  const protocolConformance = assessDomsJplLiveConformance(
    [...startupMessages, ...results.flatMap((step) => step.responseEnvelopes)],
    {
      moneyDecimals: options.moneyDecimals,
      volumeDecimals: options.volumeDecimals,
    },
  )

  const reportWithoutEvidence = {
    generatedAt,
    mode: 'doms-jpl-live-readonly-validation' as const,
    target,
    status,
    summary,
    diagnostics,
    safetyBoundary,
    steps: results,
    protocolConformance,
  }

  return {
    ...reportWithoutEvidence,
    fieldValidationEvidenceImport: buildEvidenceImport(reportWithoutEvidence),
  }
}
