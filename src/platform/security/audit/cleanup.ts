import { runStorageRetention } from '@/src/platform/retention/storageRetention'
import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import { getStationId } from '@/src/shared/utils/getStationId'

export async function cleanupAuditAndExpiredSessions() {
  const result = await runStorageRetention({
    stationId: getStationId(),
    policy: {
      ...getStorageRetentionPolicy(),
      enabled: true,
      dryRun: false,
    },
    targetKeys: ['audit_logs', 'expired_sessions'],
  })

  return {
    deletedAuditLogs:
      result.targets.find((target) => target.key === 'audit_logs')?.deleted ??
      0,
    deletedSessions:
      result.targets.find((target) => target.key === 'expired_sessions')
        ?.deleted ?? 0,
  }
}
