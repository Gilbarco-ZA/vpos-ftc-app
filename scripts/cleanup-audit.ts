import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'
import { cleanupAuditAndExpiredSessions } from '@/src/platform/security/audit/cleanup'
import { logger } from '@/src/shared/utils/logger'

const main = async () => {
  bootstrapRuntimeEnvironment()
  const result = await cleanupAuditAndExpiredSessions()
  logger.info('[cleanup-audit]', {
    msg: `Deleted ${result.deletedAuditLogs} audit log rows older than 30 days`,
  })
  logger.info('[cleanup-audit]', {
    msg: `Deleted ${result.deletedSessions} session rows older than 30 days`,
  })
}

main().catch((err) => {
  logger.error('[cleanup-audit]', { error: err })
  process.exit(1)
})
