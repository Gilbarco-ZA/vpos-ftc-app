import * as fs from 'fs/promises'
import path from 'path'
import type { ForecourtCommand } from '@/src/shared/forecourt/types'

export type CommandQueueState = 'pending' | 'inflight' | 'done' | 'dead'

export type CommandQueueRecord = {
  command: ForecourtCommand
  state: CommandQueueState
  attempts: number
  lastAttemptAt: number | null
  error?: string
}

const QUEUE_DIR = path.join(process.cwd(), 'runtime', 'forecourt-queue')
const QUEUE_FILE = path.join(QUEUE_DIR, 'commands.jsonl')

let cacheLoaded = false
const recordCache = new Map<string, CommandQueueRecord>()

const ensureQueueDir = async () => {
  await fs.mkdir(QUEUE_DIR, { recursive: true })
}

const appendRecord = async (record: CommandQueueRecord) => {
  await ensureQueueDir()
  const line = `${JSON.stringify(record)}\n`
  await fs.appendFile(QUEUE_FILE, line, 'utf-8')
  recordCache.set(record.command.id, record)
}

const loadCacheIfNeeded = async () => {
  if (cacheLoaded) return
  cacheLoaded = true

  try {
    const data = await fs.readFile(QUEUE_FILE, 'utf-8')
    const lines = data.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as CommandQueueRecord
        if (parsed?.command?.id) {
          recordCache.set(parsed.command.id, parsed)
        }
      } catch {
        // ignore malformed lines
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }
}

const getRecord = async (id: string) => {
  await loadCacheIfNeeded()
  return recordCache.get(id) ?? null
}

export const enqueue = async (command: ForecourtCommand) => {
  const record: CommandQueueRecord = {
    command,
    state: 'pending',
    attempts: 0,
    lastAttemptAt: null,
  }
  await appendRecord(record)
  return record
}

export const markInflight = async (id: string) => {
  const current = await getRecord(id)
  if (!current) return null

  const record: CommandQueueRecord = {
    ...current,
    state: 'inflight',
    attempts: current.attempts + 1,
    lastAttemptAt: Date.now(),
  }

  await appendRecord(record)
  return record
}

export const markPending = async (id: string, error?: string) => {
  const current = await getRecord(id)
  if (!current) return null

  const record: CommandQueueRecord = {
    ...current,
    state: 'pending',
    error,
    lastAttemptAt: current.lastAttemptAt ?? Date.now(),
  }

  await appendRecord(record)
  return record
}

export const markDone = async (id: string) => {
  const current = await getRecord(id)
  if (!current) return null

  const record: CommandQueueRecord = {
    ...current,
    state: 'done',
    lastAttemptAt: current.lastAttemptAt ?? Date.now(),
  }

  await appendRecord(record)
  return record
}

export const markDead = async (id: string, error: string) => {
  const current = await getRecord(id)
  if (!current) return null

  const record: CommandQueueRecord = {
    ...current,
    state: 'dead',
    error,
    lastAttemptAt: current.lastAttemptAt ?? Date.now(),
  }

  await appendRecord(record)
  return record
}

export const loadPending = async () => {
  await loadCacheIfNeeded()
  const pending: CommandQueueRecord[] = []
  for (const record of recordCache.values()) {
    if (record.state === 'pending' || record.state === 'inflight') {
      pending.push(record)
    }
  }
  return pending
}
