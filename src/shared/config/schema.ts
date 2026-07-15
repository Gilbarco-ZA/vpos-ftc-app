import { z } from 'zod'

const booleanishSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  }
  return value
}, z.boolean())

const loggerParamsSchema = z
  .object({
    label: z.string().default('VPOS'),
    level: z.string().default('warn'),
    console: booleanishSchema.default(false),
    outputToConsole: booleanishSchema.optional(),
    consoleOverride: booleanishSchema.optional(),
  })
  .passthrough()

const pluginDefinitionSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.any()).default({}),
})

const healthCheckSchema = z
  .object({
    enabled: z.boolean().optional(),
    interval: z.number().optional(),
    timeout: z.number().optional(),
  })
  .passthrough()

const memoryLimitsSchema = z
  .object({
    maxHeapSizeMB: z.number().optional(),
    maxRssSizeMB: z.number().optional(),
    maxOldSpaceSizeMB: z.number().optional(),
  })
  .passthrough()

const processDefinitionSchema = z
  .object({
    name: z.string().optional(),
    path: z.string().optional(),
    enabled: z.boolean().optional(),
    required: z.boolean().optional(),
    autoRestart: z.boolean().optional(),
    allowedToStop: z.boolean().optional(),
    startupOrder: z.number().optional(),
    debug: z.boolean().optional(),
    debugPort: z.number().optional(),
    loggerParams: loggerParamsSchema.partial().optional(),
    maxRestarts: z.number().optional(),
    restartDelay: z.number().optional(),
    startupTimeout: z.number().optional(),
    healthCheck: healthCheckSchema.optional(),
    memoryLimits: memoryLimitsSchema.optional(),
    config: z.record(z.any()).default({}),
    plugins: z.array(pluginDefinitionSchema).default([]),
  })
  .passthrough()

const processesConfigSchema = z
  .object({
    loggerParams: loggerParamsSchema,
    process: z.record(processDefinitionSchema),
  })
  .passthrough()

const supervisorConfigSchema = z
  .object({
    loggerParams: loggerParamsSchema,
    restartDelay: z.number(),
    maxRestarts: z.number(),
    healthCheckInterval: z.number(),
    startupTimeout: z.number(),
  })
  .passthrough()

const configParamsSchema = z
  .object({
    country: z.string(),
    timezone: z.string(),
    language: z.string(),
    rtl: z.boolean(),
  })
  .passthrough()

export const systemConfigSchema = z
  .object({
    config: configParamsSchema,
    supervisor: supervisorConfigSchema,
    processes: processesConfigSchema,
  })
  .passthrough()

export type SystemConfiguration = z.infer<typeof systemConfigSchema>
