#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs'

import { type DomsJplSimulatorScenario } from '@/src/modules/forecourt/infrastructure/jpl/simulator'
import { validateDomsJplSimulatorScenario } from '@/src/modules/forecourt/infrastructure/jpl/simulatorValidation'

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
  console.log(`DOMS/JPL simulator validation runner

Usage:
  npm run doms:jpl-sim:validate -- --host 127.0.0.1 --port 8888 --scenario full --json-out ./doms-jpl-sim-evidence.json

Options:
  --host <ip>                 Target host. Default: 127.0.0.1
  --port <number>             Target port. Default: 8888, or 8889 with --secure
  --secure                    Connect with TLS
  --reject-unauthorized       Enforce TLS certificate validation
  --scenario <name>           minimal | readiness | transaction-recovery | wetstock | optional-modules | full
  --timeout-ms <number>       Per-step response timeout. Default: 2000
  --idle-ms <number>          Startup unsolicited collection window. Default: 150
  --fc-access-code <value>    FcLogon access code override
  --country-code <value>      FcLogon country code override. Default: 0710
  --pos-version-id <value>    FcLogon PosVersionId override
  --json-out <path>           Write full JSON report and importable evidence payload
  --evidence-only             Print only the field-validation evidence import JSON
  --verbose                   Log request/response names
`)
  process.exit(0)
}

async function main() {
  const report = await validateDomsJplSimulatorScenario({
    host: readArg('host'),
    port: numberArg('port'),
    secure: hasFlag('secure'),
    rejectUnauthorized: hasFlag('reject-unauthorized'),
    scenario: readArg('scenario') as DomsJplSimulatorScenario | undefined,
    timeoutMs: numberArg('timeout-ms'),
    idleCollectMs: numberArg('idle-ms'),
    fcAccessCode: readArg('fc-access-code'),
    countryCode: readArg('country-code'),
    posVersionId: readArg('pos-version-id'),
    verbose: hasFlag('verbose'),
  })

  const jsonOut = readArg('json-out')
  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)
  }

  if (hasFlag('evidence-only')) {
    console.log(JSON.stringify(report.fieldValidationEvidenceImport, null, 2))
  } else {
    console.log(
      `[doms-jpl-sim-validate] ${report.status.toUpperCase()} ${report.summary.passedSteps}/${report.summary.totalSteps} steps passed; critical failures=${report.summary.criticalFailedSteps}`,
    )
    if (jsonOut)
      console.log(`[doms-jpl-sim-validate] report written to ${jsonOut}`)
    for (const step of report.steps) {
      const suffix = step.error ? ` - ${step.error}` : ''
      console.log(`  ${step.status.padEnd(7)} ${step.id}${suffix}`)
    }
  }

  if (report.status === 'failed') process.exit(1)
}

void main().catch((error) => {
  console.error(
    '[doms-jpl-sim-validate] failed:',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
})
