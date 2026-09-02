import { ensureBootstrapReady } from '@/src/platform/bootstrap/runtime'
import { queryOne } from '@/src/platform/db/postgres'
import { checkProxyDeviceStatus } from '@/src/shared/proxy/client'
import { countActiveUsers } from '@/src/shared/server/users'

export async function getBootstrapStatus() {
  const [boot, userCount, deviceStatus] = await Promise.all([
    ensureBootstrapReady(),
    countActiveUsers(),
    checkProxyDeviceStatus(),
  ])
  const station = boot.stationId
    ? await queryOne<{ name: string; country: string | null }>(
        'SELECT name, country FROM fuel_stations WHERE id = $1',
        [boot.stationId],
      )
    : null

  return { boot, userCount, deviceStatus, station }
}
