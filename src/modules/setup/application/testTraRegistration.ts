import { getRegistrationStatusViaProxy } from '@/src/shared/setup/proxy'

export async function testTraRegistration(stationId: string) {
  const result = await getRegistrationStatusViaProxy(stationId)
  return {
    success: result.ok,
    status: result.status,
    data: result.data,
    error: result.ok ? undefined : result.data?.message || result.data?.error,
  }
}
