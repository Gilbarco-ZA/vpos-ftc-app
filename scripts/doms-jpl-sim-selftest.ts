#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs'

import { type DomsJplSimulatorScenario } from '@/src/modules/forecourt/infrastructure/jpl/simulator'
import { runDomsJplSimulatorSelfTest } from '@/src/modules/forecourt/infrastructure/jpl/simulatorSelfTest'

const args = process.argv.slice(2)

const readArg = (name: string) => {
  const equals = args.find((entry) => entry.startsWith(`--${name}=`))
  if (equals) return equals.slice(name.length + 3)
  const index = args.indexOf(`--${name}`)
  if (index >= 0) return args[index + 1]
  return undefined
}

const hasFlag = (name: string) => args.includes(`--${name}`)

const numberArg = (name: string) => {
  const raw = readArg(name)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`DOMS/JPL simulator self-test

Usage:
  npm run doms:jpl-sim:selftest -- --scenario full --json-out ./doms-jpl-selftest-report.json

Options:
  --host <ip>                 Local simulator host. Default: 127.0.0.1
  --port <number>             Local simulator port. Default: 0, which asks the OS for a free port
  --scenario <name>           minimal | readiness | transaction-recovery | wetstock | optional-modules | full
  --timeout-ms <number>       Per-step response timeout. Default: 2000
  --idle-ms <number>          Startup unsolicited collection window. Default: 150
  --heartbeat-ms <number>     Simulator heartbeat interval. Default: 20000
  --fc-access-code <value>    FcLogon access code override
  --country-code <value>      FcLogon country code override. Default: 0710
  --pos-version-id <value>    FcLogon PosVersionId override
  --json-out <path>           Write full JSON self-test report
  --evidence-out <path>       Write only the importable field-validation evidence JSON
  --evidence-only             Print only the field-validation evidence import JSON
  --verbose                   Log request/response names
`)
  process.exit(0)
}

async function main() {
  const report = await runDomsJplSimulatorSelfTest({
    host: readArg('host'),
    port: numberArg('port'),
    scenario: readArg('scenario') as DomsJplSimulatorScenario | undefined,
    timeoutMs: numberArg('timeout-ms'),
    idleCollectMs: numberArg('idle-ms'),
    heartbeatMs: numberArg('heartbeat-ms'),
    fcAccessCode: readArg('fc-access-code'),
    countryCode: readArg('country-code'),
    posVersionId: readArg('pos-version-id'),
    verbose: hasFlag('verbose'),
  })

  const jsonOut = readArg('json-out')
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)

  const evidenceOut = readArg('evidence-out')
  if (evidenceOut) {
    writeFileSync(
      evidenceOut,
      `${JSON.stringify(report.fieldValidationEvidenceImport, null, 2)}\n`,
    )
  }

  if (hasFlag('evidence-only')) {
    console.log(JSON.stringify(report.fieldValidationEvidenceImport, null, 2))
  } else {
    console.log(
      `[doms-jpl-sim-selftest] ${report.status.toUpperCase()} ${report.summary.passedSteps}/${report.summary.totalSteps} steps passed on ${report.simulator.host}:${report.simulator.port}; critical failures=${report.summary.criticalFailedSteps}`,
    )
    if (jsonOut)
      console.log(`[doms-jpl-sim-selftest] report written to ${jsonOut}`)
    if (evidenceOut) {
      console.log(`[doms-jpl-sim-selftest] evidence written to ${evidenceOut}`)
    }
    for (const step of report.validation.steps) {
      const suffix = step.error ? ` - ${step.error}` : ''
      console.log(`  ${step.status.padEnd(7)} ${step.id}${suffix}`)
    }
  }

  if (report.status === 'failed') process.exit(1)
}

void main().catch((error) => {
  console.error(
    '[doms-jpl-sim-selftest] failed:',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
})
