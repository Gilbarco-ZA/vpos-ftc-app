import { z } from 'zod'

const id2Schema = z
  .string()
  .trim()
  .regex(/^\d{2}$/, 'Expected ID2 string')

const code1Schema = z
  .string()
  .trim()
  .regex(/^[0-9A-F]{2}H$/i, 'Expected CODE1 string')
  .transform((value) => value.toUpperCase())

const nameSchema = z.string().trim().min(1)
const objectDataSchema = z.record(z.any())

const envelopeSchema = z
  .object({
    name: nameSchema,
    subCode: code1Schema.optional(),
    data: objectDataSchema.optional().default({}),
    solicited: z.boolean().optional(),
    correlationId: z.any().optional(),
  })
  .passthrough()

const requestEnvelopeSchema = envelopeSchema.extend({
  name: z.string().trim().endsWith('_req').or(z.literal('heartbeat')),
})

const responseEnvelopeSchema = envelopeSchema.extend({
  name: z.string().trim(),
})

const supportedRequestSchemas = {
  heartbeat: requestEnvelopeSchema.extend({
    name: z.literal('heartbeat'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  open_Fp_req: requestEnvelopeSchema.extend({
    name: z.literal('open_Fp_req'),
    subCode: z.literal('00H'),
    data: z.object({
      FpId: id2Schema,
      PosId: id2Schema,
      FpOperationModeNo: z.number().int().nonnegative(),
    }),
  }),
  close_Fp_req: requestEnvelopeSchema.extend({
    name: z.literal('close_Fp_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema, PosId: id2Schema }),
  }),
  authorize_Fp_req: requestEnvelopeSchema.extend({
    name: z.literal('authorize_Fp_req'),
    subCode: z.enum(['00H', '01H', '02H']),
    data: z.object({ FpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  prepare_Trans_req: requestEnvelopeSchema.extend({
    name: z.literal('prepare_Trans_req'),
    subCode: z.literal('01H'),
    data: z
      .object({
        FpId: id2Schema,
        PosId: id2Schema,
        AuthorizePars: z.record(z.any()),
      })
      .passthrough(),
  }),
  FpStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('FpStatus_req'),
    subCode: z.enum(['00H', '01H', '02H', '03H']),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  FpInfo_req: requestEnvelopeSchema.extend({
    name: z.literal('FpInfo_req'),
    subCode: z.literal('01H'),
    data: z
      .object({ FpId: id2Schema, FpInfoParId: z.array(id2Schema).optional() })
      .passthrough(),
  }),
  FpFuellingData_req: requestEnvelopeSchema.extend({
    name: z.literal('FpFuellingData_req'),
    subCode: z.enum(['00H', '01H']),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  FpErrorMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('FpErrorMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  cancel_FpAuth_req: requestEnvelopeSchema.extend({
    name: z.literal('cancel_FpAuth_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  estop_Fp_req: requestEnvelopeSchema.extend({
    name: z.literal('estop_Fp_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  cancel_FpEstop_req: requestEnvelopeSchema.extend({
    name: z.literal('cancel_FpEstop_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  reset_Fp_req: requestEnvelopeSchema.extend({
    name: z.literal('reset_Fp_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  clear_FpError_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_FpError_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema, FpErrorCode: z.string().trim().min(2) }),
  }),
  FpSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('FpSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FpId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
        PosId: id2Schema,
        TransParId: z.array(id2Schema).min(1),
      })
      .passthrough(),
  }),
  unlock_FpSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('unlock_FpSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FpId: id2Schema,
        PosId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
      })
      .passthrough(),
  }),
  clear_FpSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_FpSupTrans_req'),
    subCode: z.enum(['00H', '04H']),
    data: z
      .object({
        FpId: id2Schema,
        PosId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
      })
      .passthrough(),
  }),
  change_FcStatusUpdateMode_req: requestEnvelopeSchema.extend({
    name: z.literal('change_FcStatusUpdateMode_req'),
    subCode: z.literal('00H'),
    data: z.object({ StatusUpdateCode: z.number().int().nonnegative() }),
  }),
  FcStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('FcStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  PosConnectionStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('PosConnectionStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  PssPeripheralsStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('PssPeripheralsStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  FcServiceMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('FcServiceMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  clear_FcServiceMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_FcServiceMsg_req'),
    subCode: z.literal('00H'),
    data: z
      .object({ FcServiceMsgSeqNo: z.string().trim().min(1) })
      .passthrough(),
  }),
  BackOfficeRecord_req: requestEnvelopeSchema.extend({
    name: z.literal('BackOfficeRecord_req'),
    subCode: z.enum(['00H', '01H', '02H']),
    data: z.object({}).passthrough(),
  }),
  clear_BackOfficeRecord_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_BackOfficeRecord_req'),
    subCode: z.literal('00H'),
    data: z.object({ BorSeqNo: z.string().trim().min(1) }).passthrough(),
  }),
  FpUnSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('FpUnSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FpId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
        PosId: id2Schema,
        TransParId: z.array(id2Schema).min(1),
      })
      .passthrough(),
  }),
  unlock_FpUnSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('unlock_FpUnSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FpId: id2Schema,
        PosId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
      })
      .passthrough(),
  }),
  clear_FpUnSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_FpUnSupTrans_req'),
    subCode: z.enum(['00H', '03H']),
    data: z
      .object({
        FpId: id2Schema,
        PosId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
      })
      .passthrough(),
  }),
  FcInstallStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('FcInstallStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  TgData_req: requestEnvelopeSchema.extend({
    name: z.literal('TgData_req'),
    subCode: z.literal('00H'),
    data: z.object({
      TgId: id2Schema,
      TankDataItemId: z.array(id2Schema).min(1),
    }),
  }),
  change_DynamicTankData_req: requestEnvelopeSchema.extend({
    name: z.literal('change_DynamicTankData_req'),
    subCode: z.literal('00H'),
    data: z.object({ TankId: id2Schema, DtdPars: z.record(z.any()) }),
  }),
  TgErrorMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('TgErrorMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({ TgId: id2Schema }),
  }),
  SiteDeliveryStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('SiteDeliveryStatus_req'),
    subCode: z.enum(['00H', '01H']),
    data: z.object({}).passthrough(),
  }),
  TgStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('TgStatus_req'),
    subCode: z.enum(['00H', '01H', '02H']),
    data: z.object({ TgId: id2Schema }).passthrough(),
  }),
  TankDeliveryData_req: requestEnvelopeSchema.extend({
    name: z.literal('TankDeliveryData_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        TgId: id2Schema,
        PosId: id2Schema,
        ZERO: z.number().int(),
        TankDeliveryDataItemId: z.array(id2Schema).min(1),
      })
      .passthrough(),
  }),
  clear_TankDeliveryData_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_TankDeliveryData_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        PosId: id2Schema,
        DeliveryReportSeqNo: z.string().trim().min(1),
        TankDeliveries: z
          .array(
            z.object({
              TgId: id2Schema,
              TankDeliverySeqNo: z.string().trim().min(1),
            }),
          )
          .optional(),
      })
      .passthrough(),
  }),
} satisfies Record<string, z.ZodTypeAny>

const rejectEnvelopeSchema = responseEnvelopeSchema.extend({
  name: z.literal('RejectMessage_resp'),
  data: z
    .object({
      RejectCode: z
        .object({ value: code1Schema, enum: z.record(z.string()).optional() })
        .passthrough(),
      RejectInfo: z.any().optional(),
      RejectInfoText: z.string().optional(),
      RejectedExtendedMsgCode: z.string().optional(),
      RejectedMsgSubc: z.string().optional(),
    })
    .passthrough(),
})

const multiMessageEnvelopeSchema = responseEnvelopeSchema.extend({
  name: z.literal('MultiMessage_resp'),
  data: z
    .object({
      messages: z.array(z.record(z.any())).optional(),
      Messages: z.array(z.record(z.any())).optional(),
      Message: z.array(z.record(z.any())).optional(),
      Msgs: z.array(z.record(z.any())).optional(),
    })
    .passthrough(),
})

export type JplRejectKind =
  | 'unknown_message_code'
  | 'syntax_error'
  | 'access_error'
  | 'business_rule'
  | 'protocol_validation'
  | 'transport'

export type JplMappedReject = {
  kind: JplRejectKind
  rejectCode?: string
  rejectInfo?: string
}

export class JplProtocolValidationError extends Error {
  readonly kind = 'protocol_validation'
  readonly issues: z.ZodIssue[]

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message)
    this.name = 'JplProtocolValidationError'
    this.issues = issues
  }
}

export const createCorrelationId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const canonicalizeEnvelope = (message: any) => {
  if (!message || typeof message !== 'object') return message
  const next = { ...message }
  if (next.name == null && next.Name != null) next.name = next.Name
  if (next.subCode == null && next.SubCode != null) next.subCode = next.SubCode
  if (next.subCode == null && next.subcode != null) next.subCode = next.subcode
  if (next.data == null && next.Data != null) next.data = next.Data
  if (next.solicited == null && next.Solicited != null)
    next.solicited = next.Solicited
  if (next.correlationId == null && next.CorrelationId != null) {
    next.correlationId = next.CorrelationId
  }
  return next
}

const buildIssueMessage = (prefix: string, issues: z.ZodIssue[]) => {
  const detail = issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
  return `${prefix}${detail ? ` (${detail})` : ''}`
}

const validateWithSchema = <S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  prefix: string,
): z.infer<S> => {
  const parsed = schema.safeParse(canonicalizeEnvelope(input))
  if (!parsed.success) {
    throw new JplProtocolValidationError(
      buildIssueMessage(prefix, parsed.error.issues),
      parsed.error.issues,
    )
  }
  return parsed.data
}

export const validateJplOutboundMessage = (message: unknown) => {
  const envelope = validateWithSchema(
    requestEnvelopeSchema,
    message,
    'Invalid outbound JPL message',
  )
  const specificSchema =
    supportedRequestSchemas[
      envelope.name as keyof typeof supportedRequestSchemas
    ]
  if (!specificSchema) return envelope
  return validateWithSchema(
    specificSchema,
    envelope,
    `Invalid outbound JPL message for ${envelope.name}`,
  )
}

export const normalizeJplInboundEnvelope = (message: unknown) => {
  const envelope = validateWithSchema(
    responseEnvelopeSchema,
    message,
    'Invalid inbound JPL envelope',
  )

  if (envelope.name === 'RejectMessage_resp') {
    return validateWithSchema(
      rejectEnvelopeSchema,
      envelope,
      'Invalid RejectMessage_resp envelope',
    )
  }
  if (envelope.name === 'MultiMessage_resp') {
    return validateWithSchema(
      multiMessageEnvelopeSchema,
      envelope,
      'Invalid MultiMessage_resp envelope',
    )
  }

  return envelope
}

export const mapRejectEnvelope = (message: unknown): JplMappedReject => {
  const envelope = validateWithSchema(
    rejectEnvelopeSchema,
    message,
    'Invalid RejectMessage_resp envelope',
  )

  const rejectCode = envelope.data.RejectCode?.value
  const rejectInfo = String(
    envelope.data.RejectInfoText ?? envelope.data.RejectInfo ?? '',
  ).trim()

  switch (String(rejectCode ?? '').toUpperCase()) {
    case '01H':
      return { kind: 'unknown_message_code', rejectCode, rejectInfo }
    case '02H':
      return { kind: 'syntax_error', rejectCode, rejectInfo }
    case '03H':
      return { kind: 'access_error', rejectCode, rejectInfo }
    default:
      return { kind: 'business_rule', rejectCode, rejectInfo }
  }
}
