export type StartupPhase =
  | 'bootstrapping'
  | 'http-starting'
  | 'importing'
  | 'forecourt-starting'
  | 'ready'
  | 'degraded'

export type StartupStatus = {
  phase: StartupPhase
  message: string
  detail?: string | null
  progress: number
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  importResult?: {
    inserted: Record<string, number>
    skipped: Record<string, number>
    moved: Record<string, number>
    warnings: number
  } | null
}

const startedAt = new Date().toISOString()
let status: StartupStatus = {
  phase: 'bootstrapping',
  message: 'Preparing database and application schema',
  progress: 5,
  startedAt,
  updatedAt: startedAt,
  completedAt: null,
  importResult: null,
}

export function getStartupStatus(): StartupStatus {
  return { ...status }
}

export function updateStartupStatus(
  patch: Partial<Omit<StartupStatus, 'startedAt' | 'updatedAt'>>,
) {
  status = {
    ...status,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  return getStartupStatus()
}
