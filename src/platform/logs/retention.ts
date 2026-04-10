import { deleteLogsOlderThan } from '@/src/shared/logs/service'

export async function cleanupVposLogs(days: number) {
  await deleteLogsOlderThan(days)
}
