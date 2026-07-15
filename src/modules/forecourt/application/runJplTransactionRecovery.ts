import type { SessionUser } from '@/src/shared/types'

import { startJplTcpAdapter } from '@/src/modules/forecourt/infrastructure/jpl/lifecycle'
import { runJplTransactionRecoverySweep } from '@/src/modules/forecourt/infrastructure/jpl/transactionRecovery'

export type RunJplTransactionRecoveryInput = {
  dryRun?: boolean
  confirmRecovery?: string
  limit?: number
  maxClearAttempts?: number
  staleForeignLockSeconds?: number
}

const CONFIRMATION = 'RECOVER_DOMS_TRANSACTIONS'

export async function runJplTransactionRecovery(
  input: RunJplTransactionRecoveryInput,
  user: SessionUser,
) {
  const dryRun = input.dryRun !== false

  if (!dryRun && input.confirmRecovery !== CONFIRMATION) {
    throw new Error(
      `Live DOMS transaction recovery requires confirmRecovery=${CONFIRMATION}`,
    )
  }

  if (!dryRun && !globalThis.__jplTcpClient) {
    await startJplTcpAdapter()
  }

  return await runJplTransactionRecoverySweep({
    stationId: user.stationId,
    client: dryRun ? undefined : globalThis.__jplTcpClient,
    requestedBy: user.id,
    triggerSource: 'manual_admin',
    dryRun,
    limit: input.limit,
    maxClearAttempts: input.maxClearAttempts,
    staleForeignLockSeconds: input.staleForeignLockSeconds,
  })
}
