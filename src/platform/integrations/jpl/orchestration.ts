import type { JplClientRuntimeDeps } from '@/src/platform/integrations/jpl/commands/contracts'
import type { PosCommandResult } from '@/src/platform/integrations/jpl/types'

export type JplCommandTaskQueue = {
  enqueue<T>(task: () => Promise<T>): Promise<T>
}

export type JplGatewayStartCoordinator = {
  ensureStarted(start: () => Promise<unknown>): Promise<void>
}

export const createSerializedCommandQueue = (): JplCommandTaskQueue => {
  let tail: Promise<unknown> = Promise.resolve()

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task)
      tail = next.then(
        () => undefined,
        () => undefined,
      )
      return next
    },
  }
}

export const createGatewayStartCoordinator = (): JplGatewayStartCoordinator => {
  let inFlight: Promise<void> | null = null

  return {
    async ensureStarted(start: () => Promise<unknown>): Promise<void> {
      if (!inFlight) {
        inFlight = Promise.resolve()
          .then(start)
          .then(() => undefined)
          .finally(() => {
            inFlight = null
          })
      }
      await inFlight
    },
  }
}

const defaultCommandQueue = createSerializedCommandQueue()
const defaultStartCoordinator = createGatewayStartCoordinator()

export const enqueueJplCommand = <T>(task: () => Promise<T>): Promise<T> =>
  defaultCommandQueue.enqueue(task)

export type PreparedJplCommandExecution =
  | { ok: true; client: any }
  | { ok: false; result: PosCommandResult }

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error
    ? error.message || fallback
    : String(error ?? fallback) || fallback

export async function prepareJplCommandExecution(
  runtime: JplClientRuntimeDeps,
  startCoordinator: JplGatewayStartCoordinator = defaultStartCoordinator,
): Promise<PreparedJplCommandExecution> {
  if (!runtime.getGatewayState().started) {
    try {
      await startCoordinator.ensureStarted(runtime.ensureGatewayStarted)
    } catch (error) {
      return {
        ok: false,
        result: {
          ok: false,
          accepted: false,
          error: errorMessage(error, 'JPL gateway not started'),
        },
      }
    }
  }

  const client = runtime.getClient()
  if (!client) {
    return {
      ok: false,
      result: {
        ok: false,
        accepted: false,
        error: 'APC1 client not available',
      },
    }
  }

  return { ok: true, client }
}
