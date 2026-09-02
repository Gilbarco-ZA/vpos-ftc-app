// Zod Validation Schemas
import { z } from 'zod'

// AUTH SCHEMAS

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

export const createUserSchema = z.object({
  stationId: z.string().uuid('Invalid station ID'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['administrator', 'manager', 'tenant', 'field_engineer']),
  fullName: z.string().optional(),
})

export const updateUserSchema = z
  .object({
    userId: z.string().uuid('Invalid user ID'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .optional(),
    email: z.string().email('Invalid email address').optional(),
    role: z
      .enum(['administrator', 'manager', 'tenant', 'field_engineer'])
      .optional(),
    fullName: z.string().optional(),
  })
  .refine(
    (data) =>
      data.username !== undefined ||
      data.email !== undefined ||
      data.role !== undefined ||
      data.fullName !== undefined,
    { message: 'At least one field must be updated' },
  )

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

// CUSTOMER SCHEMAS

const customerBaseSchema = z.object({
  tin: z.string().min(1, 'TIN is required').max(50),
  buyerName: z.string().min(1, 'Buyer name is required').max(255),
  buyerType: z.string().max(45).optional(),
  pin: z.string().max(50).optional(),
  passportNumber: z.string().max(45).optional(),
  businessName: z.string().max(255).optional(),
  taxNinbrn: z.string().max(50).optional(),
  contactPhone: z.string().max(50).optional(),
  contactMobile: z.string().max(50).optional(),
  contactFax: z.string().max(50).optional(),
  contactEmail: z.string().max(255).optional(),
  contactWebsite: z.string().max(255).optional(),
  contactPerson: z.string().max(255).optional(),
  addressStreet: z.string().max(255).optional(),
  addressCity: z.string().max(100).optional(),
  addressState: z.string().max(100).optional(),
  addressProvince: z.string().max(100).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCountryCode: z.string().max(2).optional(),
  country: z.string().max(100).optional(),
  odometer: z.string().max(50).optional(),
  vehicleRegNr: z.string().max(50).optional(),
  paymentType: z.enum(['CASH', 'CARD']).optional(),
})

export const customerCreateSchema = customerBaseSchema

export const customerUpdateSchema = customerBaseSchema
  .partial()
  .refine(
    (data) => data.buyerName === undefined || data.buyerName.trim().length > 0,
    { message: 'Buyer name is required' },
  )

export const customerSchema = customerCreateSchema

export const customerSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
})

// TRANSACTION SCHEMAS

export const transactionAllocateSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
})

export const transactionFilterSchema = z.object({
  status: z
    .enum([
      'OPEN',
      'ALLOCATED',
      'FISCALIZING',
      'FISCALIZED',
      'FAILED',
      'PRINTED',
      'REPRINTED',
      'CREDITED',
    ])
    .optional(),
  pumpNumber: z.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
})

// RECEIPT SCHEMAS

// REPORT SCHEMAS

export const reportFilterSchema = z.object({
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  pumpNumber: z.number().int().positive().optional(),
  userId: z.string().uuid().optional(),
  status: z
    .enum([
      'OPEN',
      'ALLOCATED',
      'FISCALIZING',
      'FISCALIZED',
      'FAILED',
      'PRINTED',
      'REPRINTED',
      'CREDITED',
    ])
    .optional(),
})

// PRODUCT SCHEMAS

export const productCreateSchema = z.object({
  productId: z.string().min(1).optional(),
  productCode: z.string().min(1, 'Product code is required'),
  productName: z.string().min(1, 'Product name is required'),
  productClassCode: z.string().min(1, 'Product class code is required'),
  productTypeCode: z.string().min(1, 'Product type code is required'),
  sku: z.string().max(120).optional(),
  barcode: z.string().max(120).optional(),
  unitPrice: z.preprocess(
    (value) =>
      value === undefined || value === null || value === ''
        ? undefined
        : Number(value),
    z.number().min(0),
  ),
  unitCost: z.preprocess(
    (value) =>
      value === undefined || value === null || value === ''
        ? undefined
        : Number(value),
    z.number().min(0),
  ),
  currency: z.string().min(1, 'Currency is required'),
  taxRate: z.preprocess(
    (value) =>
      value === undefined || value === null || value === ''
        ? 16
        : Number(value),
    z.number().min(0),
  ),
  category: z.string().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  unitOfMeasure: z.string().max(30).optional(),
  unitOfPackaging: z.string().max(30).optional(),
  packSize: z.preprocess(
    (value) =>
      value === undefined || value === null || value === ''
        ? undefined
        : Number(value),
    z.number().int().min(0).optional(),
  ),
  taxCode: z.string().min(1, 'Tax code is required').max(30),
  commodityCode: z.string().max(120).optional(),
  hazardousIndicator: z.boolean().optional().default(false),
  // External (serving-machine override) fields
  extProductId: z.string().max(64).optional(),
  extProductCode: z.string().max(64).optional(),
  extProductClassCode: z.string().max(32).optional(),
  extProductTypeCode: z.string().max(32).optional(),
  extDescription: z.string().max(255).optional(),
  extUnitOfMeasure: z.string().max(30).optional(),
  extUnitOfPackaging: z.string().max(30).optional(),
  extUnitPrice: z.number().optional(),
  extCurrency: z.string().max(8).optional(),
  extTaxCode: z.string().max(32).optional(),
  extHazardousIndicator: z.boolean().optional().default(true),
  devFlowOverride: z.enum(['offline', 'timeout']).nullable().optional(),
})

// ADMIN SCHEMAS

export const brandingSettingsSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  stationDisplayName: z.string().max(255).optional(),
  receiptFooterText: z.string().max(1000).optional(),
  receiptHeaderText: z.string().max(1000).optional(),
})

export const stationSettingsSchema = z.object({
  linkingWindowSeconds: z.number().int().min(0).max(3600).optional(),
  unallocatedHandling: z.enum(['anonymous', 'placeholder']).optional(),
  fiscalizationEngine: z.enum(['TZ', 'KE', 'mock']).optional(),
  fiscalizationTransport: z.enum(['proxy', 'local_tz']).optional(),
  autoFiscalizeEnabled: z.boolean().optional(),
  autoPrintReceipts: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  syncTime: z
    .string()
    .regex(
      /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
      'Invalid time format (HH:MM:SS)',
    )
    .optional(),
  syncTimezone: z.string().max(50).optional(),
  proxyUrl: z.string().url('Invalid proxy URL').optional(),
  proxyBasePath: z
    .string()
    .regex(/^\/[A-Za-z0-9._\/-]*$/, 'Invalid proxy base path')
    .optional(),
  vatRateTz: z.number().min(0).max(1).optional(),
  vatRateKe: z.number().min(0).max(1).optional(),
  vatRateDefault: z.number().min(0).max(1).optional(),
  moneyDecimals: z.number().int().min(0).max(3).optional(),
  unitPriceDecimals: z.number().int().min(0).max(3).optional(),
  volumeDecimals: z.number().int().min(0).max(3).optional(),
})

// PLUGIN + DEVICE CONFIG SCHEMAS

export const pluginConfigUpsertSchema = z.object({
  processType: z.string().min(1, 'processType is required').max(100),
  pluginName: z.string().min(1, 'pluginName is required').max(100),
  enabled: z.boolean(),
  configJson: z.any().optional().default({}),
  schemaVersion: z.number().int().min(1).max(100).optional().default(1),
})

export const deviceConfigUpsertSchema = z.object({
  deviceType: z.string().min(1, 'deviceType is required').max(100),
  deviceKey: z.string().min(1, 'deviceKey is required').max(150),
  enabled: z.boolean(),
  configJson: z.any().optional().default({}),
  schemaVersion: z.number().int().min(1).max(100).optional().default(1),
})

export const userUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  fullName: z.string().max(255).optional(),
  role: z
    .enum(['administrator', 'manager', 'tenant', 'field_engineer'])
    .optional(),
  isActive: z.boolean().optional(),
})

// STATION SCHEMAS

export const createStationSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(1).max(255),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z
    .string()
    .trim()
    .min(2)
    .max(3)
    .transform((value) => value.toUpperCase()),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
})

// SYNC SCHEMAS

// TYPE EXPORTS

export type LoginInput = z.infer<typeof loginSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CustomerInput = z.infer<typeof customerSchema>
export type CustomerSearchInput = z.infer<typeof customerSearchSchema>
export type TransactionAllocateInput = z.infer<typeof transactionAllocateSchema>
export type TransactionFilterInput = z.infer<typeof transactionFilterSchema>
export type ReportFilterInput = z.infer<typeof reportFilterSchema>
export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type BrandingSettingsInput = z.infer<typeof brandingSettingsSchema>
export type StationSettingsInput = z.infer<typeof stationSettingsSchema>
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type CreateStationInput = z.infer<typeof createStationSchema>

// POS INTEGRATION SCHEMAS

export const posBackendSchema = z.enum(['none', 'jpl', 'ppx', 'ligo', 'namos'])

const httpUrlSchema = z
  .string()
  .url('Invalid URL')
  .transform((v) => v.replace(/\/+$/, ''))

const optionalNonEmptyString = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, 'Required')

export const jplIntegrationSchema = z
  .object({
    host: optionalNonEmptyString,
    appId: optionalNonEmptyString.optional(),
    countryCode: optionalNonEmptyString.optional(),
    enabledApcs: z.array(z.enum(['apc1', 'apc2'])).optional(),
    timeoutMs: z.number().int().min(1000).max(120_000).optional(),
    posId: z.number().int().min(0).max(99).optional(),
    fpOperationModeNo: z.number().int().min(0).max(99).optional(),
    portOverrides: z
      .object({
        apc1: z.number().int().min(1).max(65535).optional(),
        apc2: z.number().int().min(1).max(65535).optional(),
      })
      .optional(),
  })
  .partial({
    appId: true,
    countryCode: true,
    enabledApcs: true,
    timeoutMs: true,
    posId: true,
    fpOperationModeNo: true,
    portOverrides: true,
  })

export const ppxIntegrationSchema = z
  .object({
    baseUrl: httpUrlSchema,
    timeoutMs: z.number().int().min(1000).max(120_000).optional(),
    apiKey: z.string().optional(),
    healthPath: z.string().optional(),
    commandPath: z.string().optional(),
  })
  .partial({
    timeoutMs: true,
    apiKey: true,
    healthPath: true,
    commandPath: true,
  })

export const ligoIntegrationSchema = z
  .object({
    baseUrl: httpUrlSchema.optional(),
    timeoutMs: z.number().int().min(1000).max(120_000).optional(),
    apiKey: z.string().optional(),
  })
  .partial()

export const namosIntegrationSchema = z
  .object({
    baseUrl: httpUrlSchema.optional(),
    timeoutMs: z.number().int().min(1000).max(120_000).optional(),
    apiKey: z.string().optional(),
  })
  .partial()

export const posIntegrationUpdateSchema = z
  .object({
    backend: posBackendSchema,
    // Config blocks are required iff backend selects them.
    jpl: jplIntegrationSchema.optional(),
    ppx: ppxIntegrationSchema.optional(),
    ligo: ligoIntegrationSchema.optional(),
    namos: namosIntegrationSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const jpl = v.jpl
    if (v.backend === 'jpl' && !jpl?.host) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jpl', 'host'],
        message: 'JPL host is required',
      })
    }
    if (v.backend === 'ppx' && !v.ppx?.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ppx', 'baseUrl'],
        message: 'PPX baseUrl is required',
      })
    }
  })
