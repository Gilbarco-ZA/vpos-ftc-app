import type {
  DomsJplSimulatorConfig,
  DomsJplSimulatorScenario,
} from '@/src/modules/forecourt/infrastructure/jpl/simulator'
import type {
  DomsJplSimulatorValidationOptions,
  DomsJplSimulatorValidationReport,
} from '@/src/modules/forecourt/infrastructure/jpl/simulatorValidation'

import { createDomsJplSimulator } from '@/src/modules/forecourt/infrastructure/jpl/simulator'
import { validateDomsJplSimulatorScenario } from '@/src/modules/forecourt/infrastructure/jpl/simulatorValidation'

type JsonObject = Record<string, unknown>

export type DomsJplSimulatorSelfTestOptions = {
  host?: string
  port?: number
  secure?: boolean
  tlsCertPath?: string
  tlsKeyPath?: string
  rejectUnauthorized?: boolean
  scenario?: DomsJplSimulatorScenario
  timeoutMs?: number
  idleCollectMs?: number
  heartbeatMs?: number
  fcAccessCode?: string
  countryCode?: string
  posVersionId?: string
  fcCount?: number
  tankCount?: number
  pricePoleCount?: number
  washPointCount?: number
  sensorCount?: number
  vendingCount?: number
  verbose?: boolean
}

export type DomsJplSimulatorSelfTestReport = {
  generatedAt: string
  mode: 'doms-jpl-simulator-self-test'
  simulator: {
    host: string
    port: number
    secure: boolean
    scenario: DomsJplSimulatorScenario
    heartbeatMs: number | null
    startedAt: string
    stoppedAt: string | null
  }
  validation: DomsJplSimulatorValidationReport
  status: DomsJplSimulatorValidationReport['status']
  summary: DomsJplSimulatorValidationReport['summary'] & {
    simulatorStarted: boolean
    simulatorStopped: boolean
    reportCanBeImported: boolean
  }
  fieldValidationEvidenceImport: JsonObject
  safetyBoundary: string
}

const bool = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const positiveInt = (value: unknown, fallback: number, max = 300_000) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(max, Math.trunc(parsed))
}

const DEFAULT_SCENARIO: DomsJplSimulatorScenario = 'full'

export async function runDomsJplSimulatorSelfTest(
  input: DomsJplSimulatorSelfTestOptions = {},
): Promise<DomsJplSimulatorSelfTestReport> {
  const scenario = input.scenario ?? DEFAULT_SCENARIO
  const secure = bool(input.secure)
  const simulatorConfig: DomsJplSimulatorConfig = {
    host: input.host ?? '127.0.0.1',
    port: positiveInt(input.port, 0, 65_535),
    secure,
    tlsCertPath: input.tlsCertPath,
    tlsKeyPath: input.tlsKeyPath,
    scenario,
    heartbeatMs: positiveInt(input.heartbeatMs, 20_000),
    fcCount: input.fcCount,
    tankCount: input.tankCount,
    pricePoleCount: input.pricePoleCount,
    washPointCount: input.washPointCount,
    sensorCount: input.sensorCount,
    vendingCount: input.vendingCount,
    countryCode: input.countryCode,
    verbose: input.verbose,
  }
  const simulator = createDomsJplSimulator(simulatorConfig)
  const startedAt = new Date().toISOString()
  let stoppedAt: string | null = null
  let started: Awaited<ReturnType<typeof simulator.start>> | null = null

  try {
    started = await simulator.start()
    const validationOptions: DomsJplSimulatorValidationOptions = {
      host: started.host,
      port: started.port,
      secure: started.secure,
      rejectUnauthorized: bool(input.rejectUnauthorized),
      scenario,
      timeoutMs: positiveInt(input.timeoutMs, 2_000),
      idleCollectMs: positiveInt(input.idleCollectMs, 150),
      fcAccessCode: input.fcAccessCode,
      countryCode: input.countryCode,
      posVersionId: input.posVersionId,
      verbose: input.verbose,
    }
    const validation = await validateDomsJplSimulatorScenario(validationOptions)
    await simulator.stop()
    stoppedAt = new Date().toISOString()

    return {
      generatedAt: new Date().toISOString(),
      mode: 'doms-jpl-simulator-self-test',
      simulator: {
        host: started.host,
        port: started.port,
        secure: started.secure,
        scenario,
        heartbeatMs: simulatorConfig.heartbeatMs ?? null,
        startedAt,
        stoppedAt,
      },
      validation,
      status: validation.status,
      summary: {
        ...validation.summary,
        simulatorStarted: true,
        simulatorStopped: true,
        reportCanBeImported: validation.fieldValidationEvidenceImport != null,
      },
      fieldValidationEvidenceImport: {
        ...validation.fieldValidationEvidenceImport,
        sourceSystem: 'doms-jpl-simulator-self-test',
        evidenceReference: `doms-jpl-simulator-self-test://${started.host}:${started.port}/${scenario}`,
        results: {
          ...(validation.fieldValidationEvidenceImport.results as JsonObject),
          selfTest: true,
          simulatorStartedAt: startedAt,
          simulatorStoppedAt: stoppedAt,
        },
      },
      safetyBoundary:
        'Self-test starts a local simulator and sends JPL requests only to that simulator. It does not connect to or write to a live DOMS/PSS controller.',
    }
  } catch (error) {
    try {
      await simulator.stop()
      stoppedAt = new Date().toISOString()
    } catch {
      stoppedAt = null
    }
    throw error
  }
}
