import { runStorageRetention } from '@/src/platform/retention/storageRetention'
import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import { getStationId } from '@/src/shared/utils/getStationId'

export async function cleanupVposLogs(days: number) {
  const result = await runStorageRetention({
    stationId: getStationId(),
    policy: {
      ...getStorageRetentionPolicy(),
      enabled: true,
      dryRun: false,
      vposLogDays: Math.max(1, Math.floor(days)),
    },
    targetKeys: ['vpos_logs'],
  })

  return (
    result.targets.find((target) => target.key === 'vpos_logs')?.deleted ?? 0
  )
}
