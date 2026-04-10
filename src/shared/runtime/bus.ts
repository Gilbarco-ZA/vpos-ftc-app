import {
  ensurePlainObject,
  requireNonEmptyString,
  toPositiveInt,
} from '@/src/shared/utils/inputs'

export type RuntimeBusTopic = string

export type RuntimeBusHandler<T = unknown> = (msg: T) => void | Promise<void>

export interface RuntimeBus {
  publish<T = unknown>(topic: RuntimeBusTopic, msg: T): Promise<void>
  subscribe<T = unknown>(
    topic: RuntimeBusTopic,
    handler: RuntimeBusHandler<T>,
  ): () => void
}

export interface RuntimeBusRequestOptions {
  timeoutMs?: number
  replyTopic?: RuntimeBusTopic
  correlationKey?: string
}

export interface RuntimeBusRequestEnvelope<T = unknown> {
  requestId: string
  payload: T
  replyTopic: string
}

export interface RuntimeBusResponseEnvelope<T = unknown> {
  requestId: string
  payload: T
}

class InProcessBus implements RuntimeBus {
  private readonly emitter = new (require('node:events').EventEmitter)()

  async publish(topic: RuntimeBusTopic, msg: unknown): Promise<void> {
    this.emitter.emit(topic, msg)

    const enriched =
      msg && typeof msg === 'object'
        ? ({ ...(msg as Record<string, unknown>), topic } as Record<
            string,
            unknown
          >)
        : ({ topic, payload: msg } as Record<string, unknown>)
    this.emitter.emit('*', enriched)
  }

  subscribe<T = unknown>(
    topic: RuntimeBusTopic,
    handler: RuntimeBusHandler<T>,
  ): () => void {
    const wrapped = (msg: unknown) => void handler(msg as T)
    this.emitter.on(topic, wrapped)
    return () => this.emitter.off(topic, wrapped)
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __vposRuntimeBus: RuntimeBus | undefined
}

export function getRuntimeBus(): RuntimeBus {
  if (!globalThis.__vposRuntimeBus) {
    globalThis.__vposRuntimeBus = new InProcessBus()
  }
  return globalThis.__vposRuntimeBus
}

export async function requestOnce<
  TReq extends Record<string, unknown>,
  TRes = unknown,
>(topic: string, message: TReq, timeoutMs?: number): Promise<TRes> {
  const normalizedTopic = requireNonEmptyString(topic, 'topic')
  const req = ensurePlainObject(message, message)
  const bus = getRuntimeBus()
  const replyTopic = `${normalizedTopic}:reply`
  const correlationKey = 'requestId'
  const normalizedTimeout =
    timeoutMs == null ? 5000 : toPositiveInt(timeoutMs, 5000, 60000)

  const requestId = req[correlationKey]
  if (!requestId) {
    throw new Error(`requestOnce requires req[${correlationKey}] to be set`)
  }

  return await new Promise<TRes>((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      unsubscribe()
      reject(
        new Error(`timeout waiting for ${replyTopic} (${normalizedTimeout}ms)`),
      )
    }, normalizedTimeout)

    const unsubscribe = bus.subscribe<Record<string, unknown>>(
      replyTopic,
      (msg) => {
        if (done) return
        if (!msg || msg[correlationKey] !== requestId) return
        done = true
        clearTimeout(timer)
        unsubscribe()
        resolve(msg as TRes)
      },
    )

    void bus.publish(normalizedTopic, req)
  })
}

/**
 * Listener wiring is intentionally deferred to legacy runtime internals until
 * MIG-025 completes the deeper event-consumer migration.
 */
export function startPosBusListener() {
  void import('@/src/modules/runtime/infrastructure/busListeners').then((mod) =>
    mod.startPosBusListener(),
  )
}

export function startFiscalBusListener() {
  void import('@/src/modules/runtime/infrastructure/busListeners').then((mod) =>
    mod.startFiscalBusListener(),
  )
}

export function startArchiveBusListener() {
  void import('@/src/modules/runtime/infrastructure/busListeners').then((mod) =>
    mod.startArchiveBusListener(),
  )
}
