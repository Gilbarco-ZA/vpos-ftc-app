import util from 'node:util'

import { appendLogBlock } from '@/src/shared/logs/service'

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

type OriginalConsole = Pick<Console, ConsoleLevel>

let installedForStation: string | null = null
let currentStationId: string | null = null
let originals: OriginalConsole | null = null
let flushTimer: NodeJS.Timeout | null = null
let flushInFlight = false
let queue: string[] = []

const NON_PERSISTED_LOG_MARKERS = ['[db-slow-query]', '[db]']

function nowIso() {
  return new Date().toISOString()
}

function serializeArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`
  }
  return util.inspect(arg, {
    depth: 6,
    colors: false,
    maxArrayLength: 200,
    breakLength: 140,
    compact: false,
  })
}

function formatLine(level: ConsoleLevel, args: unknown[]) {
  const message = args.map(serializeArg).join(' ')
  return `[${nowIso()}] [${process.pid}] [${level.toUpperCase()}] ${message}`
}

function shouldPersistLine(line: string) {
  return !NON_PERSISTED_LOG_MARKERS.some((marker) => line.includes(marker))
}

async function flush() {
  const stationId = currentStationId || installedForStation
  if (!stationId || flushInFlight || !queue.length) return
  flushInFlight = true
  const batch = queue.join('\n')
  queue = []
  try {
    await appendLogBlock(stationId, 'live', 'application.log', batch)
    const errorLines = batch
      .split('\n')
      .filter((line) => line.includes('[ERROR]') || line.includes('[WARN]'))
      .join('\n')
    if (errorLines) {
      await appendLogBlock(
        stationId,
        'live',
        'application-errors.log',
        errorLines,
      )
    }
  } catch {
    // Never break stdout or stderr flow because of DB log persistence failures.
  } finally {
    flushInFlight = false
    if (queue.length) {
      void flush()
    }
  }
}

export function installConsoleCapture(stationId: string) {
  if (!stationId) return
  currentStationId = stationId
  if (installedForStation === stationId && originals) return

  const originalConsole: OriginalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  originals = originalConsole
  installedForStation = stationId
  currentStationId = stationId

  const patch = (level: ConsoleLevel) => {
    return (...args: unknown[]) => {
      originalConsole[level](...args)
      const line = formatLine(level, args)
      if (!shouldPersistLine(line)) return
      queue.push(line)
      if (queue.length >= 25) {
        void flush()
      }
    }
  }

  console.log = patch('log')
  console.info = patch('info')
  console.warn = patch('warn')
  console.error = patch('error')
  console.debug = patch('debug')

  if (flushTimer) clearInterval(flushTimer)
  flushTimer = setInterval(() => {
    void flush()
  }, 1000)
  flushTimer.unref()

  const shutdown = () => {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }
    if (queue.length) {
      void flush()
    }
  }

  process.once('beforeExit', shutdown)
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

export function updateConsoleCaptureStation(stationId: string) {
  if (!stationId) return
  currentStationId = stationId
  if (!installedForStation) installedForStation = stationId
}
