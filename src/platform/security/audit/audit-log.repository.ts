import type { AuditAction, AuditLog } from '@/src/shared/types'

import { createWhereBuilder, query } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/ids'

export interface AuditLogParams {
  stationId?: string
  userId?: string
  action: AuditAction
  entityType: string
  entityId?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

type AuditLogRow = Omit<
  AuditLog,
  | 'stationId'
  | 'userId'
  | 'entityType'
  | 'entityId'
  | 'oldValues'
  | 'newValues'
  | 'ipAddress'
  | 'userAgent'
  | 'createdAt'
> & {
  station_id: string | null
  user_id: string | null
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string | Date
  metadata: Record<string, unknown> | null
}

export const createAuditLog = async (
  params: AuditLogParams,
): Promise<AuditLog> => {
  const auditLogsId = uuidv4()
  const result = await query<Record<string, unknown>>(
    `INSERT INTO audit_logs (
      id, station_id, user_id, action, entity_type, entity_id,
      old_values, new_values, ip_address, user_agent, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      auditLogsId,
      params.stationId,
      params.userId,
      params.action,
      params.entityType,
      params.entityId,
      params.oldValues ? JSON.stringify(params.oldValues) : null,
      params.newValues ? JSON.stringify(params.newValues) : null,
      params.ipAddress,
      params.userAgent,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  )

  const row = result.rows[0]
  return {
    id: row.id as string,
    stationId: row.station_id as string | undefined,
    userId: row.user_id as string | undefined,
    action: row.action as AuditAction,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | undefined,
    oldValues: row.old_values as Record<string, unknown> | undefined,
    newValues: row.new_values as Record<string, unknown> | undefined,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: new Date(row.created_at as string),
  }
}

export const getAuditLogs = async (filters: {
  stationId?: string
  userId?: string
  action?: AuditAction
  entityType?: string
  entityId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}): Promise<{ logs: AuditLog[]; total: number }> => {
  const wb = createWhereBuilder()

  wb.addIf(filters.stationId, 'station_id = $#', filters.stationId)
  wb.addIf(filters.userId, 'user_id = $#', filters.userId)
  wb.addIf(filters.action, 'action = $#', filters.action)
  wb.addIf(filters.entityType, 'entity_type = $#', filters.entityType)
  wb.addIf(filters.entityId, 'entity_id = $#', filters.entityId)
  wb.addIf(filters.startDate, 'created_at >= $#', filters.startDate)
  wb.addIf(filters.endDate, 'created_at <= $#', filters.endDate)

  const whereClause = wb.toWhere()

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
    wb.params,
  )
  const total = parseInt(countResult.rows[0]?.count || '0', 10)

  const limit = Math.min(filters.limit || 50, 100)
  const offset = filters.offset || 0

  const logsResult = await query<AuditLogRow>(
    `SELECT * FROM audit_logs ${whereClause}
   ORDER BY created_at DESC
   LIMIT $${wb.nextIndex} OFFSET $${wb.nextIndex + 1}`,
    [...wb.params, limit, offset],
  )

  const logs: AuditLog[] = logsResult.rows.map((row) => ({
    id: row.id,
    stationId: row.station_id ?? undefined,
    userId: row.user_id ?? undefined,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ?? undefined,
    oldValues: row.old_values ?? undefined,
    newValues: row.new_values ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: new Date(row.created_at as string | Date),
  }))

  return { logs, total }
}

export const auditCustomerCreated = async (
  stationId: string,
  userId: string,
  customerId: string,
  customerData: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> => {
  await createAuditLog({
    stationId,
    userId,
    action: 'CUSTOMER_CREATED',
    entityType: 'customer',
    entityId: customerId,
    newValues: customerData,
    ipAddress,
  })
}

export const auditCustomerImported = async (
  stationId: string,
  userId: string,
  customerId: string,
  cloudCustomerId: string,
  customerData: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> => {
  await createAuditLog({
    stationId,
    userId,
    action: 'CUSTOMER_IMPORTED',
    entityType: 'customer',
    entityId: customerId,
    newValues: customerData,
    metadata: { cloudCustomerId },
    ipAddress,
  })
}

export const auditTransactionAllocated = async (
  stationId: string,
  userId: string,
  transactionId: string,
  customerId: string,
  ipAddress?: string,
): Promise<void> => {
  await createAuditLog({
    stationId,
    userId,
    action: 'TRANSACTION_ALLOCATED',
    entityType: 'transaction',
    entityId: transactionId,
    newValues: { customerId },
    ipAddress,
  })
}

export const auditAutoFiscalization = async (
  stationId: string,
  transactionId: string,
  result: { success: boolean; reference?: string; error?: string },
): Promise<void> => {
  await createAuditLog({
    stationId,
    action: 'TRANSACTION_AUTO_FISCALIZED',
    entityType: 'transaction',
    entityId: transactionId,
    newValues: result,
  })
}

export const auditReceiptPrinted = async (
  stationId: string,
  userId: string,
  receiptId: string,
  transactionId: string,
  isReprint: boolean,
  ipAddress?: string,
): Promise<void> => {
  await createAuditLog({
    stationId,
    userId,
    action: isReprint ? 'RECEIPT_REPRINTED' : 'RECEIPT_PRINTED',
    entityType: 'receipt',
    entityId: receiptId,
    metadata: { transactionId },
    ipAddress,
  })
}

export const auditSyncEvent = async (
  stationId: string,
  action: 'SYNC_STARTED' | 'SYNC_COMPLETED' | 'SYNC_FAILED',
  metadata: Record<string, unknown>,
): Promise<void> => {
  await createAuditLog({
    stationId,
    action,
    entityType: 'sync',
    metadata,
  })
}

export const auditUserLogin = async (
  stationId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> => {
  await createAuditLog({
    stationId,
    userId,
    action: 'USER_LOGIN',
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
  })
}

export async function auditSettingsUpdated(params: {
  stationId: string
  userId: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}) {
  return await createAuditLog({
    stationId: params.stationId,
    userId: params.userId,
    action: 'SETTINGS_UPDATED',
    entityType: 'station_settings',
    entityId: undefined,
    oldValues: params.oldValues,
    newValues: params.newValues,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: { scope: 'station_settings' },
  })
}
