import { runWorkerEntrypoint } from '@/workers/shared/worker-runner'

import { startTransactionFiscalizationRuntimeWorker } from '@/src/platform/runtime'

const DEFAULT_POLL_MS = 750

/**
 * Thin worker entrypoint.
 *
 * Queue claiming and transaction fiscalization still live in the existing
 * transaction worker implementation. This wrapper is the canonical entrypoint
 * while that logic is extracted into module-owned services in later tranches.
 */
export function startFiscalizeTransactionWorker(opts?: { pollMs?: number }) {
  return startTransactionFiscalizationRuntimeWorker({
    pollMs: opts?.pollMs ?? DEFAULT_POLL_MS,
  })
}

export async function runFiscalizeTransactionWorker() {
  return await runWorkerEntrypoint({
    workerName: 'fiscalize-transaction.worker',
    pollEnvNames: ['VPOS_TX_WORKER_POLL_MS', 'VPOS_WORKER_POLL_MS'],
    defaultPollMs: DEFAULT_POLL_MS,
    start: async ({ pollMs }) => startFiscalizeTransactionWorker({ pollMs }),
  })
}
