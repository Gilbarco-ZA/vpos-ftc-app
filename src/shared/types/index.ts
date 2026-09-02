export type UserRole = 'administrator' | 'manager' | 'tenant' | 'field_engineer'

export type StationSummary = {
  id: string
  code: string
  name: string
  country: string
}

export type SessionUser = {
  id: string
  stationId: string
  username: string
  email: string
  role: UserRole
  fullName?: string
  name?: string
  station: StationSummary
}

export type User = {
  id: string
  stationId: string
  username: string
  email: string
  passwordHash: string
  role: UserRole
  fullName?: string
  isActive: boolean
  lastLoginAt?: Date
  cloudUserId?: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export * from './transactions'

export type Session = {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Date
  ipAddress?: string
  userAgent?: string
}

export type StationSettings = Record<string, unknown>

export type AuditAction =
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_DELETED'
  | 'CUSTOMER_RESTORED'
  | 'CUSTOMER_IMPORTED'
  | 'TRANSACTION_ALLOCATED'
  | 'TRANSACTION_AUTO_FISCALIZED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'SETTINGS_UPDATED'
  | 'DEVICE_CONFIG_UPDATED'
  | 'DEVICE_CONFIG_UPSERTED'
  | 'DOMS_MAPPING_UPDATED'
  | 'DOMS_MAPPING_ROLLED_BACK'
  | 'DOMS_MAPPING_BULK_APPLIED'
  | 'DOMS_MAINTENANCE_PLAN_REVIEWED'
  | 'DOMS_MAINTENANCE_SESSION_REQUESTED'
  | 'DOMS_MAINTENANCE_SESSION_APPROVED'
  | 'DOMS_MAINTENANCE_SESSION_CANCELLED'
  | 'DOMS_MAINTENANCE_COMMANDS_PREVIEWED'
  | 'DOMS_MAINTENANCE_EXECUTION_BLOCKED'
  | 'DOMS_MAINTENANCE_FINAL_CONFIRMATION_RECORDED'
  | 'DOMS_MAINTENANCE_COMMAND_EXECUTED'
  | 'DOMS_MAINTENANCE_COMMAND_FAILED'
  | 'DOMS_FIELD_VALIDATION_CHECKPOINT_RECORDED'
  | 'DOMS_DEPLOYMENT_SIGN_OFF_RECORDED'
  | 'DOMS_COMMISSIONING_CHECKLIST_UPDATED'
  | 'DOMS_REPLAY_TRANSACTION_RESTORED'
  | 'PLUGIN_CONFIG_UPDATED'
  | 'PLUGIN_CONFIG_UPSERTED'
  | 'BRANDING_UPDATED'
  | 'POS_INTEGRATIONS_UPDATED'
  | 'CONFIG_UPDATED'
  | 'SYNC_FAILED'
  | 'SYNC_COMPLETED'
  | 'SYNC_STARTED'
  | 'RECEIPT_REPRINTED'
  | 'RECEIPT_PRINTED'
  | 'STORAGE_RETENTION_POLICY_UPDATED'
  | 'STORAGE_RETENTION_RUN_REQUESTED'
  | 'PRINT_JOB_RETRIED'
  | 'PRINT_JOB_CLEARED'
  | 'APPLICATION_SERVICE_RESTART_REQUESTED'
  | 'DATABASE_BACKUP_CREATED'
  | 'FULL_SYSTEM_BACKUP_CREATED'
  | 'APPLICATION_DATABASE_RESET_REQUESTED'

export type AuditLog = {
  id: string
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
  createdAt: Date
}

export type ProductSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'
export type ProductDevFlowOverride =
  | 'cloud-only'
  | 'local-only'
  | 'dual-write'
  | 'offline'
  | 'timeout'
