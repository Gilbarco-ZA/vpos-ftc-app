#!/usr/bin/env tsx
import type {
  DomsJplSimulatorConfig,
  DomsJplSimulatorScenario,
} from '@/src/modules/forecourt/infrastructure/jpl/simulator'

import { createDomsJplSimulator } from '@/src/modules/forecourt/infrastructure/jpl/simulator'

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
  console.log(`DOMS/JPL simulator

Usage:
  npm run doms:jpl-sim -- --port 8888 --scenario full

Options:
  --host <ip>                 Listen host. Default: 127.0.0.1
  --port <number>             Listen port. Default: 8888, or 8889 with --secure
  --secure                    Start a TLS server. Requires --tls-cert and --tls-key for most clients.
  --tls-cert <path>           TLS certificate path
  --tls-key <path>            TLS private key path
  --scenario <name>           minimal | readiness | transaction-recovery | wetstock | optional-modules | full
  --fp-count <number>         Number of fuelling points
  --tank-count <number>       Number of tank gauges
  --price-pole-count <number> Number of price poles
  --wash-point-count <number> Number of wash points
  --sensor-count <number>     Number of sensors
  --vending-count <number>    Number of vending machines
  --heartbeat-ms <number>     Server heartbeat interval. Default: 20000
  --welcome-version <version> JPL welcome version. Default: 470-02-1.07
  --verbose                   Log request/response names
`)
  process.exit(0)
}

const config: DomsJplSimulatorConfig = {
  host: readArg('host'),
  port: numberArg('port'),
  secure: hasFlag('secure'),
  tlsCertPath: readArg('tls-cert'),
  tlsKeyPath: readArg('tls-key'),
  scenario: readArg('scenario') as DomsJplSimulatorScenario | undefined,
  heartbeatMs: numberArg('heartbeat-ms'),
  welcomeVersion: readArg('welcome-version'),
  fcCount: numberArg('fp-count'),
  tankCount: numberArg('tank-count'),
  pricePoleCount: numberArg('price-pole-count'),
  washPointCount: numberArg('wash-point-count'),
  sensorCount: numberArg('sensor-count'),
  vendingCount: numberArg('vending-count'),
  verbose: hasFlag('verbose'),
}

async function main() {
  const simulator = createDomsJplSimulator(config)
  const started = await simulator.start()
  console.log(
    `[doms-jpl-simulator] listening on ${started.secure ? 'tls' : 'tcp'}://${started.host}:${started.port} scenario=${simulator.config.scenario}`,
  )

  const shutdown = async () => {
    console.log('\n[doms-jpl-simulator] stopping')
    await simulator.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

void main().catch((error) => {
  console.error(
    '[doms-jpl-simulator] failed to start:',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
})
