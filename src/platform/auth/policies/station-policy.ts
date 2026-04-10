import type { SessionUser } from '@/src/shared/types'

export const canAccessStation = (
  user: SessionUser,
  stationId: string,
): boolean => {
  return user.stationId === stationId
}
