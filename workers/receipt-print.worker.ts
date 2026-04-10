import { runWorkerEntrypoint } from '@/workers/shared/worker-runner'

import { startReceiptPrintRuntimeWorker } from '@/src/platform/runtime'

const DEFAULT_POLL_MS = 500

/**
 * Thin worker entrypoint.
 *
 * Job rendering and retry behavior still live in the current print worker.
 * This wrapper provides the canonical startup surface for the print queue.
 */
export function startReceiptPrintWorker(opts?: { pollMs?: number }) {
  return startReceiptPrintRuntimeWorker({
    pollMs: opts?.pollMs ?? DEFAULT_POLL_MS,
  })
}

export async function runReceiptPrintWorker() {
  return await runWorkerEntrypoint({
    workerName: 'receipt-print.worker',
    pollEnvNames: ['VPOS_PRINT_WORKER_POLL_MS', 'VPOS_WORKER_POLL_MS'],
    defaultPollMs: DEFAULT_POLL_MS,
    start: async ({ pollMs }) => startReceiptPrintWorker({ pollMs }),
  })
}
