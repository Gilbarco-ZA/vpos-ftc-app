/*
 * Dedicated background worker process.
 *
 * Run with: npm run worker
 *
 * This is intentionally separate from the Next.js server process so we can
 * run long-lived polling loops (queues, POS command routing, etc.) without
 * tying correctness to Next's request lifecycle.
 */

import {
  bootstrapRuntimeEnvironment,
  startDedicatedWorkerProcess,
} from '@/src/platform/runtime'

bootstrapRuntimeEnvironment()
startDedicatedWorkerProcess()
