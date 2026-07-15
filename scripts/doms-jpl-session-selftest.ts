#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs'

import { runDomsJplSessionResilienceSelfTest } from '@/src/modules/forecourt/infrastructure/jpl/simulatorSessionValidation'

const args = process.argv.slice(2)

const readArg = (name: string) => {
  const equals = args.find((entry) => entry.startsWith(`--${name}=`))
  if (equals) return equals.slice(name.length + 3)
  const index = args.indexOf(`--${name}`)
  if (index >= 0) return args[index + 1]
  return undefined
}

const numberArg = (name: string) => {
  const raw = readArg(name)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`DOMS/JPL session resilience self-test

Usage:
  npm run doms:jpl-session:selftest -- --json-out ./doms-jpl-session-report.json

Options:
  --host <ip>              Local simulator host. Default: 127.0.0.1
  --port <number>          Local simulator port. Default: 0
  --timeout-ms <number>    Connection and response timeout. Default: 1000
  --heartbeat-ms <number>  Local simulator heartbeat interval. Default: 25
  --dead-ms <number>       Dead-connection threshold. Default: 100
  --json-out <path>        Write the complete JSON report
`)
  process.exit(0)
}

async function main() {
  const report = await runDomsJplSessionResilienceSelfTest({
    host: readArg('host'),
    port: numberArg('port'),
    timeoutMs: numberArg('timeout-ms'),
    heartbeatMs: numberArg('heartbeat-ms'),
    deadConnectionTimeoutMs: numberArg('dead-ms'),
  })

  const jsonOut = readArg('json-out')
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    `[doms-jpl-session-selftest] ${report.status.toUpperCase()} ` +
      `connections=${report.simulatorStats.totalConnections} ` +
      `recovered=${report.summary.transactionRecoveredAfterRestart} ` +
      `dead-timeout=${report.summary.deadConnectionDetected}`,
  )
  if (report.error) console.error(`[doms-jpl-session-selftest] ${report.error}`)
  if (jsonOut)
    console.log(`[doms-jpl-session-selftest] report written to ${jsonOut}`)
  if (report.status === 'failed') process.exit(1)
}

void main().catch((error) => {
  console.error(
    '[doms-jpl-session-selftest] failed:',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
})
