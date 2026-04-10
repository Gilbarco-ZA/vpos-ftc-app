export type LogData = Record<string, unknown>

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): number {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel
  return LOG_LEVELS[env] ?? LOG_LEVELS.info
}

function format(level: string, tag: string, data?: LogData): string {
  const base = `[${level.toUpperCase()}] [${tag}]`
  if (!data || Object.keys(data).length === 0) return base

  try {
    return `${base} ${JSON.stringify(data)}`
  } catch {
    return base
  }
}

/**
 * Stable shared structured logger.
 * Preserve the existing `logger.<level>(tag, data?)` call shape.
 */
export const logger = {
  debug(tag: string, data?: LogData) {
    if (getMinLevel() <= LOG_LEVELS.debug) {
      // eslint-disable-next-line no-console
      console.debug(format('debug', tag, data))
    }
  },
  info(tag: string, data?: LogData) {
    if (getMinLevel() <= LOG_LEVELS.info) {
      // eslint-disable-next-line no-console
      console.log(format('info', tag, data))
    }
  },
  warn(tag: string, data?: LogData) {
    if (getMinLevel() <= LOG_LEVELS.warn) {
      // eslint-disable-next-line no-console
      console.warn(format('warn', tag, data))
    }
  },
  error(tag: string, data?: LogData) {
    // eslint-disable-next-line no-console
    console.error(format('error', tag, data))
  },
}

export type Logger = typeof logger
