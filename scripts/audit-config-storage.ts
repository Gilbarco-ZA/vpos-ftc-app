import process from 'node:process'

import { runConfigStorageAudit } from '@/src/platform/config/audit/configStorageAudit'
import { closePool } from '@/src/platform/db/postgres/core'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'

const main = async () => {
  bootstrapRuntimeEnvironment()
  const requireSafe = process.argv.includes('--require-safe')
  const requireRetired = process.argv.includes('--require-retired')
  const result = await runConfigStorageAudit()

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (requireSafe && !result.safeForDestructiveMigration) process.exitCode = 2
  if (requireRetired && !result.retirementComplete) process.exitCode = 3
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => undefined)
  })
