import { resolveStationTimezone } from '@/src/shared/time/localTimezone'

export {
  deviceLocalTimezone,
  isValidIanaTimezone,
  resolveLocalTimezone,
} from '@/src/shared/time/localTimezone'

export async function resolveTanzaniaFiscalTimezone(stationId: string) {
  return await resolveStationTimezone(stationId)
}
