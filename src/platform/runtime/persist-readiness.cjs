'use strict'

// Shared by the bundled Next.js server lifecycle route and unit tests.
// No success is reported unless all known in-process persistence queues are
// drained for consecutive samples and PostgreSQL confirms SELECT 1.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function awaitQueuesDrained(readQueues, checkDatabase, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10000
  const pollMs = opts.pollMs ?? 250
  const requiredStableSamples = opts.requiredStableSamples ?? 3
  const started = Date.now()
  let stable = 0

  while (Date.now() - started < timeoutMs) {
    let queues
    try {
      queues = readQueues()
      if (!Array.isArray(queues) || queues.length === 0)
        return { ok: false, status: 'unverified', reason: 'queue diagnostics unavailable' }
      let busy = false
      for (const queue of queues) {
        if (!queue || !Number.isSafeInteger(queue.active) ||
            !Number.isSafeInteger(queue.queued) ||
            !Number.isSafeInteger(queue.failed) ||
            queue.active < 0 || queue.queued < 0 || queue.failed < 0) {
          return { ok: false, status: 'unverified', reason: 'invalid queue diagnostics' }
        }
        if (queue.failed > 0) {
          return { ok: false, status: 'unverified', reason: 'persistence queue reported failures' }
        }
        busy = busy || queue.active > 0 || queue.queued > 0
      }
      stable = busy ? 0 : stable + 1
      if (stable >= requiredStableSamples) {
        const dbHealthy = await checkDatabase()
        if (!dbHealthy)
          return { ok: false, status: 'unverified', reason: 'PostgreSQL health check failed' }
        return { ok: true, status: 'persisted' }
      }
    } catch {
      return { ok: false, status: 'unverified', reason: 'persistence diagnostics failed' }
    }
    await delay(pollMs)
  }

  return { ok: false, status: 'unverified', reason: 'persistence queues did not drain before timeout' }
}

module.exports = { awaitQueuesDrained }
