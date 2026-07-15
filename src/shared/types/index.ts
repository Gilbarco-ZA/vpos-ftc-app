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

export type SyncConflict = {
  tableName: string
  localId: string
  cloudId?: string | null
  reason: string
  payload?: Record<string, unknown> | null
}

export type SyncResult = {
  success: boolean
  message?: string
  summary?: Record<string, unknown>
  conflicts?: SyncConflict[]
  recordsPushed?: number
  recordsPulled?: number
  errors?: Array<{ message?: string } | string>
}

export type ProductSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'
export type ProductDevFlowOverride =
  | 'cloud-only'
  | 'local-only'
  | 'dual-write'
  | 'offline'
  | 'timeout'

export type Product = {
  id: string
  stationId: string
  productId: string
  productCode: string
  productName: string
  productClassCode: string
  productTypeCode: string
  sku?: string
  barcode?: string
  unitPrice: number
  unitCost: number
  currency: string
  taxRate: number
  category?: string
  categoryId?: string
  categoryIcon?: string | null
  categoryImagePath?: string | null
  unitOfMeasure?: string
  unitOfPackaging?: string
  packSize?: string
  taxCode?: string
  commodityCode?: string
  hazardousIndicator?: boolean
  devFlowOverride?: ProductDevFlowOverride | null
  lastSyncStatus?: ProductSyncStatus
  lastSyncAt?: string | null
}

export type SelectOption = {
  label: string
  value: string
}
