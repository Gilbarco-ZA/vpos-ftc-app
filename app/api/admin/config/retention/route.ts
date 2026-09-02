import type { StorageRetentionPolicyInput } from '@/src/platform/retention/storageRetentionPolicy'

import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute, defineMutationRoute } from '@/src/shared/http/defineRoute'
import { createAuditLog } from '@/src/shared/audit/log'
import {
  getStationStorageRetentionPolicy,
  saveStationStorageRetentionPolicy,
} from '@/src/platform/retention/storageRetentionPolicy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return ok(await getStationStorageRetentionPolicy(user.stationId))
  },
})

export const POST = defineMutationRoute<StorageRetentionPolicyInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const policy = await saveStationStorageRetentionPolicy(user.stationId, body)
    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'STORAGE_RETENTION_POLICY_UPDATED',
      entityType: 'station_kv',
      metadata: policy,
    }).catch(() => {})
    return ok(policy)
  },
})
