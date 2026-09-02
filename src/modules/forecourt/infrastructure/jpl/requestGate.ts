export type JplSolicitedRequestGateMode =
  | 'correlated-concurrent'
  | 'strict-single-flight'

type RequestGateClient = {
  getRequestDispatchMode?: () => unknown
  getServerSupportsCorrelationIds?: () => unknown
  requestDispatcher?: {
    getDispatchMode?: () => unknown
  }
}

type QueuedRequest<T> = {
  task: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export type JplSolicitedRequestGateDiagnostics = {
  mode: JplSolicitedRequestGateMode
  concurrency: number
  active: number
  queued: number
}

const resolveMode = (
  client: RequestGateClient,
): JplSolicitedRequestGateMode => {
  try {
    const direct = client.getRequestDispatchMode?.()
    if (
      direct === 'correlated-concurrent' ||
      direct === 'strict-single-flight'
    ) {
      return direct
    }
  } catch {
    // A correlation-required vendor policy can throw while capability is
    // unavailable. The outer application gate must fail safe to single-flight.
  }

  try {
    const dispatcherMode = client.requestDispatcher?.getDispatchMode?.()
    if (
      dispatcherMode === 'correlated-concurrent' ||
      dispatcherMode === 'strict-single-flight'
    ) {
      return dispatcherMode
    }
  } catch {
    // Fall through to the conservative capability check below.
  }

  return client.getServerSupportsCorrelationIds?.() === true
    ? 'correlated-concurrent'
    : 'strict-single-flight'
}

export const createJplSolicitedRequestGate = (args: {
  client: RequestGateClient
  maxConcurrent?: number
  onModeChange?: (diagnostics: JplSolicitedRequestGateDiagnostics) => void
}) => {
  const configuredMax = Number(args.maxConcurrent ?? 8)
  const maxConcurrent = Number.isFinite(configuredMax)
    ? Math.max(1, Math.min(32, Math.trunc(configuredMax)))
    : 8
  const queue: Array<QueuedRequest<unknown>> = []
  let active = 0
  let lastMode: JplSolicitedRequestGateMode | null = null
  let pumping = false

  const getDiagnostics = (): JplSolicitedRequestGateDiagnostics => {
    const mode = resolveMode(args.client)
    return {
      mode,
      concurrency: mode === 'correlated-concurrent' ? maxConcurrent : 1,
      active,
      queued: queue.length,
    }
  }

  const notifyModeChange = () => {
    const diagnostics = getDiagnostics()
    if (diagnostics.mode === lastMode) return diagnostics
    lastMode = diagnostics.mode
    try {
      args.onModeChange?.(diagnostics)
    } catch {
      // Observability must never block request dispatch.
    }
    return diagnostics
  }

  const pump = () => {
    if (pumping) return
    pumping = true

    try {
      const diagnostics = notifyModeChange()
      while (queue.length > 0 && active < diagnostics.concurrency) {
        const job = queue.shift()!
        active += 1
        void Promise.resolve()
          .then(job.task)
          .then(job.resolve, job.reject)
          .finally(() => {
            active = Math.max(0, active - 1)
            pump()
          })
      }
    } finally {
      pumping = false
    }
  }

  const run = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push({
        task: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      pump()
    })

  return {
    run,
    getDiagnostics,
  }
}
