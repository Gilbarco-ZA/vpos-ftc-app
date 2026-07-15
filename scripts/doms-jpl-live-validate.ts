#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs'
import type { DomsJplLiveValidationProfile } from '@/src/modules/forecourt/infrastructure/jpl/liveValidation'

import { validateDomsJplLiveReadOnlyTarget } from '@/src/modules/forecourt/infrastructure/jpl/liveValidation'

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
  console.log(`DOMS/JPL live read-only validation runner

Usage:
  npm run doms:jpl-live:validate -- --host 192.168.1.50 --port 8888 --profile full-readonly --json-out ./doms-jpl-live-report.json --evidence-out ./doms-jpl-live-evidence.json

Options:
  --host <ip>                 Target DOMS/PSS host. Default: 127.0.0.1
  --port <number>             Target port. Default: 8888, or 8889 with --secure
  --secure                    Connect with TLS
  --reject-unauthorized       Enforce TLS certificate validation
  --profile <name>            minimal-readonly | dispense-readonly | wetstock-readonly | optional-readonly | full-readonly
  --timeout-ms <number>       Per-step response timeout. Default: 3000
  --idle-ms <number>          Startup unsolicited collection window. Default: 250
  --money-decimals <number>    Explicit site money decimal positions for live scaling validation
  --volume-decimals <number>   Explicit site volume decimal positions for live scaling validation
  --fc-access-code <value>    FcLogon access code override
  --country-code <value>      FcLogon country code override. Default: 0710
  --pos-version-id <value>    FcLogon PosVersionId override (default: 470-02-1.08)
  --logon-subcode <00H|01H>   FcLogon variant. Default: 00H
  --include-reject-probe      Send one intentionally unsupported request to validate RejectMessage_resp handling
  --json-out <path>           Write full JSON report
  --evidence-out <path>       Write field-validation evidence import JSON
  --evidence-only             Print only the field-validation evidence import JSON
  --verbose                   Log request/response names

Safety:
  This runner sends read/status requests only. It does not clear buffers, authorize pumps, change prices, reset devices, write dynamic tank data, or execute PSS maintenance commands.
`)
  process.exit(0)
}

async function main() {
  const report = await validateDomsJplLiveReadOnlyTarget({
    host: readArg('host'),
    port: numberArg('port'),
    secure: hasFlag('secure'),
    rejectUnauthorized: hasFlag('reject-unauthorized'),
    profile: readArg('profile') as DomsJplLiveValidationProfile | undefined,
    timeoutMs: numberArg('timeout-ms'),
    idleCollectMs: numberArg('idle-ms'),
    fcAccessCode: readArg('fc-access-code'),
    countryCode: readArg('country-code'),
    posVersionId: readArg('pos-version-id'),
    logonSubCode: readArg('logon-subcode') as '00H' | '01H' | undefined,
    includeRejectProbe: hasFlag('include-reject-probe'),
    verbose: hasFlag('verbose'),
    moneyDecimals: numberArg('money-decimals'),
    volumeDecimals: numberArg('volume-decimals'),
  })

  const jsonOut = readArg('json-out')
  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)
  }

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
      `[doms-jpl-live-validate] ${report.status.toUpperCase()} ${report.summary.passedSteps}/${report.summary.totalSteps} steps passed; critical failures=${report.summary.criticalFailedSteps}`,
    )
    console.log(
      `[doms-jpl-live-validate] safety: read-only=${report.safetyBoundary.readOnlyOnly}; pssWritesAttempted=${report.safetyBoundary.pssWritesAttempted}; transactionBufferReadsAttempted=${report.safetyBoundary.transactionBufferReadsAttempted}`,
    )
    console.log(
      `[doms-jpl-live-validate] transport: tcpConnected=${report.diagnostics.tcpConnected}; welcomeReceived=${report.summary.welcomeReceived}; welcomeVersion=${report.summary.welcomeVersion ?? 'unknown'}; logonPassed=${report.summary.logonPassed}; uncorrelatedFallbacks=${report.diagnostics.uncorrelatedResponseFallbacks}`,
    )
    console.log(
      `[doms-jpl-live-validate] conformance: ${report.protocolConformance.status}; fpStatusParserValidated=${report.protocolConformance.summary.fpStatusParserValidated}; valueNormalizationValidated=${report.protocolConformance.summary.valueNormalizationValidated}`,
    )
    if (jsonOut)
      console.log(`[doms-jpl-live-validate] report written to ${jsonOut}`)
    if (evidenceOut) {
      console.log(`[doms-jpl-live-validate] evidence written to ${evidenceOut}`)
    }
    for (const step of report.steps) {
      const suffix = step.error ? ` - ${step.error}` : ''
      console.log(
        `  ${step.status.padEnd(7)} ${step.id} correlation=${step.correlationMatch}${suffix}`,
      )
    }
  }

  if (report.status === 'failed') process.exit(1)
}

void main().catch((error) => {
  console.error(
    '[doms-jpl-live-validate] failed:',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
})
