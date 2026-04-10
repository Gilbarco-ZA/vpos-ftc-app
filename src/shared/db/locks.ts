import {
  advisoryUnlock as platformAdvisoryUnlock,
  tryAdvisoryLock as platformTryAdvisoryLock,
} from '@/src/platform/db/postgres/locks'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

/**
 * Shared DB keeps only validation and the cross-cutting caller contract.
 * Advisory lock SQL remains platform-owned Postgres behavior.
 */
export async function tryAdvisoryLock(key: string): Promise<boolean> {
  return await platformTryAdvisoryLock(requireNonEmptyString(key, 'key'))
}

export async function advisoryUnlock(key: string): Promise<void> {
  await platformAdvisoryUnlock(requireNonEmptyString(key, 'key'))
}
