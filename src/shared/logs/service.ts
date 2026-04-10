import { readNumberEnv } from '@/src/platform/config/env'
import {
  query,
  queryAll,
  queryOne,
  queryUnobserved,
} from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type LogType = 'live' | 'archive' | 'restart'

const DEFAULT_MAX_LIVE_LOG_CHARS = 250_000

function maxLiveLogChars() {
  return Math.max(
    10_000,
    readNumberEnv('VPOS_MAX_LIVE_LOG_CHARS', DEFAULT_MAX_LIVE_LOG_CHARS),
  )
}

export async function listLogs(
  stationId: string,
  type: LogType,
  start?: Date,
  end?: Date,
) {
  const params: any[] = [stationId, type]
  let where = 'WHERE station_id = $1 AND type = $2'
  if (start) {
    params.push(start)
    where += ` AND updated_at >= $${params.length}`
  }
  if (end) {
    params.push(end)
    where += ` AND updated_at <= $${params.length}`
  }
  return await queryAll<{
    filename: string
    size: number
    created_at: string
    updated_at: string
  }>(
    `SELECT filename, OCTET_LENGTH(content) AS size, created_at, updated_at
       FROM vpos_logs ${where}
      ORDER BY updated_at DESC, filename ASC`,
    params,
  )
}

export async function appendLogBlock(
  stationId: string,
  type: LogType,
  filename: string,
  block: string,
) {
  const chunk = String(block || '').trim()
  if (!chunk) return
  const maxChars = maxLiveLogChars()

  await queryUnobserved(
    `INSERT INTO vpos_logs (id, station_id, type, filename, content)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (station_id, type, filename)
     DO UPDATE SET
       content = CASE
         WHEN $6 <= 0 OR $3 <> 'live' THEN
           CASE
             WHEN vpos_logs.content = '' THEN EXCLUDED.content
             ELSE vpos_logs.content || E'\n' || EXCLUDED.content
           END
         ELSE RIGHT(
           CASE
             WHEN vpos_logs.content = '' THEN EXCLUDED.content
             ELSE vpos_logs.content || E'\n' || EXCLUDED.content
           END,
           $6
         )
       END,
       updated_at = NOW()`,
    [uuidv4(), stationId, type, filename, chunk, maxChars],
  )
}

export async function getLogContent(
  stationId: string,
  type: LogType,
  filename: string,
) {
  const row = await queryOne<{ filename: string; content: string }>(
    `SELECT filename, content FROM vpos_logs WHERE station_id = $1 AND type = $2 AND filename = $3`,
    [stationId, type, filename],
  )
  if (!row) return null
  return { filename: row.filename, data: row.content }
}

export async function appendLogLine(
  stationId: string,
  type: LogType,
  filename: string,
  line: string,
) {
  await appendLogBlock(stationId, type, filename, line)
}

export async function clearLogs(
  stationId: string,
  type: LogType,
  filenames: string[],
) {
  const safeNames = Array.from(
    new Set(
      (Array.isArray(filenames) ? filenames : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  )
  if (!safeNames.length) return 0

  const placeholders = safeNames.map((_, index) => `$${index + 3}`).join(', ')
  const res = await query(
    `UPDATE vpos_logs
        SET content = '',
            updated_at = NOW()
      WHERE station_id = $1
        AND type = $2
        AND filename IN (${placeholders})`,
    [stationId, type, ...safeNames],
  )
  return res.rowCount ?? 0
}

export async function clearLog(
  stationId: string,
  type: LogType,
  filename: string,
) {
  await query(
    `UPDATE vpos_logs SET content = '', updated_at = NOW() WHERE station_id = $1 AND type = $2 AND filename = $3`,
    [stationId, type, filename],
  )
}

export async function deleteLogsOlderThan(days: number) {
  const n = Math.max(1, Math.floor(days))
  await query(
    `DELETE FROM vpos_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
    [String(n)],
  )
}

export async function readStationLog(
  stationId: string,
  type: LogType,
  filename: string,
) {
  return await getLogContent(stationId, type, filename)
}

export async function clearStationLog(
  stationId: string,
  type: LogType,
  filename: string,
) {
  await clearLog(stationId, type, filename)
}
