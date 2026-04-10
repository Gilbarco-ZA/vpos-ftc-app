import fs from 'fs'
import path from 'path'

import { logger } from './logger'
import { isUuid, uuidv4 } from './uuid'

const STATION_ID_FILENAME = 'station-id'
const DEFAULT_PERM_DIRS = [
  '/opt/fccapps/vpos-perm/vposftc',
  path.join(process.cwd(), 'perm'),
]

let stationId: string | null = null

const unique = <T>(values: T[]): T[] =>
  values.filter((value, index) => values.indexOf(value) === index)

const getPermDirCandidates = (): string[] => {
  const envDir = (process.env.PERM_DIR || '').trim()
  return unique(
    [envDir, ...DEFAULT_PERM_DIRS]
      .map((dir) => dir.trim())
      .filter((dir) => dir.length > 0),
  )
}

const readStationIdFromDir = (dir: string): string | null => {
  const filePath = path.join(dir, STATION_ID_FILENAME)
  try {
    if (!fs.existsSync(filePath)) return null
    const value = fs.readFileSync(filePath, 'utf8').trim()
    return value || null
  } catch (error) {
    logger.warn('[stationId]', {
      msg: `failed to read station id from ${filePath}`,
      error,
    })
    return null
  }
}

const findWritableDir = (
  dirs: string[],
): { dir: string; lastError?: unknown } => {
  let lastError: unknown
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.accessSync(dir, fs.constants.W_OK)
      return { dir }
    } catch (error) {
      lastError = error
      logger.warn('[stationId]', {
        msg: `cannot use station id directory ${dir}`,
        error,
      })
    }
  }
  return { dir: '', lastError }
}

export function getStationId(): string {
  if (stationId) return stationId

  const envStation = String(
    process.env.VPOS_STATION_ID || process.env.STATION_ID || '',
  ).trim()
  if (envStation && isUuid(envStation)) {
    stationId = envStation
    return stationId
  }

  const candidates = getPermDirCandidates()

  for (const dir of candidates) {
    const existing = readStationIdFromDir(dir)
    if (existing) {
      stationId = existing
      return stationId
    }
  }

  const { dir: writableDir, lastError } = findWritableDir(candidates)
  if (writableDir) {
    const filePath = path.join(writableDir, STATION_ID_FILENAME)
    try {
      stationId = uuidv4()
      fs.writeFileSync(filePath, stationId, { mode: 0o600 })
      return stationId
    } catch (error) {
      logger.error('[stationId]', {
        msg: `failed to persist station id to ${filePath}`,
        error,
      })
    }
  }

  logger.error('[stationId]', {
    msg: 'persistence failed, generating volatile id',
    error: lastError ?? undefined,
  })
  stationId = uuidv4()
  return stationId
}
