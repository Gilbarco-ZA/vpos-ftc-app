import { cleanupVposLogs } from '@/src/platform/logs/retention'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'
import { logger } from '@/src/shared/utils/logger'

async function main() {
  bootstrapRuntimeEnvironment()
  const days = parseInt(process.env.VPOS_LOG_RETENTION_DAYS || '30', 10)
  logger.info('[cleanup-vpos-logs]', {
    msg: `Cleaning vpos_logs older than ${days} days`,
  })
  const deleted = await cleanupVposLogs(days)
  logger.info('[cleanup-vpos-logs]', {
    msg: `Deleted ${deleted} vpos_logs row(s)`,
  })
}

main().catch((err) => {
  logger.error('[cleanup-vpos-logs]', { error: err })
  process.exit(1)
})
