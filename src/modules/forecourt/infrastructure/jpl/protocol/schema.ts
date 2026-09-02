import { z } from 'zod'

const id2Schema = z
  .string()
  .trim()
  .regex(/^\d{2}$/, 'Expected ID2 string')

const id2OrZeroSchema = z
  .string()
  .trim()
  .regex(/^\d{2}$/, 'Expected ID2 or ID_ZERO string')

const dec2OrZeroSchema = z.union([
  z
    .string()
    .trim()
    .regex(/^\d{1,2}$/),
  z.literal(0),
])

const dec4Schema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Expected DEC4 string')

const dec6Schema = z
  .string()
  .trim()
  .regex(/^\d{6}$/)

const dec10Schema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Expected DEC10 string')

const num2Schema = z.number().int().nonnegative()

const fcDateTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{14}$/, 'Expected FC_DATE_AND_TIME string')

const code1Schema = z
  .string()
  .trim()
  .regex(/^[0-9A-F]{2}H$/i, 'Expected CODE1 string')
  .transform((value) => value.toUpperCase())

const code2Schema = z
  .string()
  .trim()
  .regex(/^[0-9A-F]{4}H$/i, 'Expected CODE2 string')
  .transform((value) => value.toUpperCase())

const nameSchema = z.string().trim().min(1)
const objectDataSchema = z.record(z.any())
const priceSetTypeSchema = z.enum(['00H', '01H'])

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

  FpGradeTotals_req: requestEnvelopeSchema.extend({
    name: z.literal('FpGradeTotals_req'),
    subCode: z.enum(['00H', '01H']),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  PumpGradeTotals_req: requestEnvelopeSchema.extend({
    name: z.literal('PumpGradeTotals_req'),
    subCode: z.enum(['00H', '01H']),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  PumpGradeBlendTotals_req: requestEnvelopeSchema.extend({
    name: z.literal('PumpGradeBlendTotals_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  FbTotals_req: requestEnvelopeSchema.extend({
    name: z.literal('FbTotals_req'),
    subCode: z.literal('00H'),
    data: z.object({ FpId: id2Schema }).passthrough(),
  }),
  clear_FallbackTotals_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_FallbackTotals_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FbTotalsSeqNo: z
          .string()
          .trim()
          .regex(/^\d{2}$/),
        TotalNoFbTransactions: dec6Schema,
      })
      .passthrough(),
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
    subCode: z.literal('04H'),
    data: z
      .object({
        FpId: id2Schema,
        PosId: id2Schema,
        TransSeqNo: z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Expected DEC4 TransSeqNo'),
        Vol_e: dec10Schema,
        Money_e: dec10Schema,
        PaymentParameters: z
          .object({
            ReferenceNo: z.array(z.number().int().min(0).max(255)).optional(),
          })
          .passthrough(),
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

  FcDateAndTime_req: requestEnvelopeSchema.extend({
    name: z.literal('FcDateAndTime_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  change_FcDateAndTime_req: requestEnvelopeSchema.extend({
    name: z.literal('change_FcDateAndTime_req'),
    subCode: z.literal('00H'),
    data: z.object({ FcDateAndTime: fcDateTimeSchema }).passthrough(),
  }),
  FcOperationModeStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('FcOperationModeStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({}).passthrough(),
  }),
  change_FcOperationModeNo_req: requestEnvelopeSchema.extend({
    name: z.literal('change_FcOperationModeNo_req'),
    subCode: z.literal('00H'),
    data: z
      .object({ FcOperationModeNo: z.number().int().min(0).max(9) })
      .passthrough(),
  }),
  UtilEcho_req: requestEnvelopeSchema.extend({
    name: z.literal('UtilEcho_req'),
    subCode: z.literal('00H'),
    data: z
      .object({ EchoData: z.array(z.number().int().min(0).max(255)) })
      .passthrough(),
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
  store_BackOfficeRecord_req: requestEnvelopeSchema.extend({
    name: z.literal('store_BackOfficeRecord_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        BorClientType: code1Schema,
        BorClientId: id2OrZeroSchema,
        BorDataType: code1Schema,
        BorData: z.string(),
      })
      .passthrough(),
  }),
  clear_BackOfficeRecord_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_BackOfficeRecord_req'),
    subCode: z.literal('00H'),
    data: z.object({ BorSeqNo: z.string().trim().min(1) }).passthrough(),
  }),
  ClientData_req: requestEnvelopeSchema.extend({
    name: z.literal('ClientData_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        PosId: id2OrZeroSchema,
        ClientDataOffset: num2Schema,
        ClientDataLen: num2Schema,
      })
      .passthrough(),
  }),
  store_ClientData_req: requestEnvelopeSchema.extend({
    name: z.literal('store_ClientData_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        PosId: id2OrZeroSchema,
        ClientDataOffset: num2Schema,
        ClientData: z.array(code1Schema),
      })
      .passthrough(),
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

  FcPriceSetStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('FcPriceSetStatus_req'),
    subCode: z.enum(['00H', '01H']),
    data: z.object({}).passthrough(),
  }),
  FcPriceSet_req: requestEnvelopeSchema.extend({
    name: z.literal('FcPriceSet_req'),
    subCode: z.enum(['02H', '03H', '04H']),
    data: z
      .object({
        PriceSetType: priceSetTypeSchema.optional(),
        FcPriceSetId: id2OrZeroSchema.optional(),
        PriceSetActivationDateAndTime: fcDateTimeSchema.optional(),
      })
      .passthrough(),
  }),
  change_FcPriceSet_req: requestEnvelopeSchema.extend({
    name: z.literal('change_FcPriceSet_req'),
    subCode: z.enum(['02H', '03H', '04H']),
    data: z
      .object({
        UserId: z.string().trim().optional(),
        FcPriceSetId: id2Schema,
        FcPriceGroupId: z.array(id2Schema).min(1),
        FcGradeId: z.array(id2Schema).min(1),
        FcPriceGroups: z.array(z.array(z.string().trim().min(1))).min(1),
        PriceSetActivationDateAndTime: fcDateTimeSchema,
      })
      .passthrough(),
  }),
  clear_PendingFcPriceSet_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_PendingFcPriceSet_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FcPriceSetId: id2OrZeroSchema,
        PriceSetActivationDateAndTime: fcDateTimeSchema,
      })
      .passthrough(),
  }),

  change_FpOperationModeSet_req: requestEnvelopeSchema.extend({
    name: z.literal('change_FpOperationModeSet_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        FpId: id2Schema,
        FpOperationModes: z
          .array(
            z
              .object({
                FpOperationModeNo: z.number().int().nonnegative(),
                FpOperationType: z.number().int().nonnegative(),
                FpServiceModes: z
                  .array(
                    z
                      .object({
                        SmId: id2Schema,
                        FmgId: id2Schema,
                        FcPriceGroupId: id2Schema,
                      })
                      .passthrough(),
                  )
                  .min(1),
              })
              .passthrough(),
          )
          .min(1),
      })
      .passthrough(),
  }),

  install_Fp_req: requestEnvelopeSchema.extend({
    name: z.literal('install_Fp_req'),
    subCode: z.enum(['00H', '01H', '02H', '03H']),
    data: z
      .object({
        FpId: id2Schema,
        FpInstallPars: z.record(z.any()).optional(),
        PumpInterfaceType: z.number().int().optional(),
        PssChannelNo: z.number().int().optional(),
        PhysicalAddress: z.number().int().optional(),
        FpGradeOptions: z.array(z.record(z.any())).optional(),
      })
      .passthrough(),
  }),

  clear_InstallData_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_InstallData_req'),
    subCode: z.literal('01H'),
    data: z
      .object({ ExtendedInstallMsgCode: code2Schema, FcDeviceId: id2Schema })
      .passthrough(),
  }),
  PpStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('PpStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({ PpId: id2Schema }).passthrough(),
  }),
  open_Pp_req: requestEnvelopeSchema.extend({
    name: z.literal('open_Pp_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        PpId: id2Schema,
        PosId: id2Schema,
        PpOperationModeNo: z.number().int().nonnegative(),
      })
      .passthrough(),
  }),
  close_Pp_req: requestEnvelopeSchema.extend({
    name: z.literal('close_Pp_req'),
    subCode: z.literal('00H'),
    data: z.object({ PpId: id2Schema }).passthrough(),
  }),
  PpErrorMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('PpErrorMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({ PpId: id2Schema }).passthrough(),
  }),
  clear_PpError_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_PpError_req'),
    subCode: z.literal('00H'),
    data: z.object({ PpId: id2Schema, PpErrorCode: z.string().trim().min(2) }),
  }),
  reset_Pp_req: requestEnvelopeSchema.extend({
    name: z.literal('reset_Pp_req'),
    subCode: z.literal('00H'),
    data: z.object({ PpId: id2Schema }).passthrough(),
  }),
  change_WpOperationModeSet_req: requestEnvelopeSchema.extend({
    name: z.literal('change_WpOperationModeSet_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        WpId: id2Schema,
        WpOperationModes: z
          .array(
            z
              .object({
                WpOperationModeNo: z.number().int().nonnegative(),
                WpOperationType: z.number().int().nonnegative(),
                WpServiceModes: z
                  .array(
                    z
                      .object({
                        WpSmId: id2Schema,
                        WpWmgId: id2Schema,
                        FcPriceGroupId: id2Schema,
                      })
                      .passthrough(),
                  )
                  .min(1),
              })
              .passthrough(),
          )
          .min(1),
      })
      .passthrough(),
  }),
  open_Wp_req: requestEnvelopeSchema.extend({
    name: z.literal('open_Wp_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        WpId: id2Schema,
        PosId: id2OrZeroSchema,
        WpOperationModeNo: z.number().int().nonnegative(),
      })
      .passthrough(),
  }),
  close_Wp_req: requestEnvelopeSchema.extend({
    name: z.literal('close_Wp_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2OrZeroSchema }).passthrough(),
  }),
  WpStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('WpStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema }).passthrough(),
  }),
  prepare_WpAuth_req: requestEnvelopeSchema.extend({
    name: z.literal('prepare_WpAuth_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  authorize_Wp_req: requestEnvelopeSchema.extend({
    name: z.literal('authorize_Wp_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  cancel_WpAuth_req: requestEnvelopeSchema.extend({
    name: z.literal('cancel_WpAuth_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  stop_Wp_req: requestEnvelopeSchema.extend({
    name: z.literal('stop_Wp_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  cancel_WpStop_req: requestEnvelopeSchema.extend({
    name: z.literal('cancel_WpStop_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema, PosId: id2Schema }).passthrough(),
  }),
  WpUnSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('WpUnSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        WpId: id2Schema,
        TransSeqNo: dec4Schema,
        PosId: id2OrZeroSchema,
        WpTransParId: z.array(id2Schema).min(1),
        RcpItemIdEptRd: z.array(id2Schema).optional(),
      })
      .passthrough(),
  }),
  unlock_WpUnSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('unlock_WpUnSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        WpId: id2Schema,
        PosId: id2OrZeroSchema,
        TransSeqNo: dec4Schema,
      })
      .passthrough(),
  }),
  clear_WpUnSupTrans_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_WpUnSupTrans_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        WpId: id2Schema,
        PosId: id2OrZeroSchema,
        TransSeqNo: dec4Schema,
        Money: z.string().trim().min(1),
      })
      .passthrough(),
  }),
  WpErrorMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('WpErrorMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema }).passthrough(),
  }),
  clear_WpError_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_WpError_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema, WpErrorCode: z.string().trim().min(2) }),
  }),
  reset_Wp_req: requestEnvelopeSchema.extend({
    name: z.literal('reset_Wp_req'),
    subCode: z.literal('00H'),
    data: z.object({ WpId: id2Schema }).passthrough(),
  }),
  DiopStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('DiopStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({ DiopId: id2Schema }).passthrough(),
  }),
  change_DiopOutput_req: requestEnvelopeSchema.extend({
    name: z.literal('change_DiopOutput_req'),
    subCode: z.literal('00H'),
    data: z
      .object({ DiopId: id2Schema, DiopControl: code1Schema })
      .passthrough(),
  }),
  SensorStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('SensorStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({ SensorId: id2Schema }).passthrough(),
  }),
  VmStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('VmStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema }).passthrough(),
  }),
  open_Vm_req: requestEnvelopeSchema.extend({
    name: z.literal('open_Vm_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema }).passthrough(),
  }),
  close_Vm_req: requestEnvelopeSchema.extend({
    name: z.literal('close_Vm_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema }).passthrough(),
  }),
  VmDrystockTotals_req: requestEnvelopeSchema.extend({
    name: z.literal('VmDrystockTotals_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema }).passthrough(),
  }),
  VmErrorMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('VmErrorMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema }).passthrough(),
  }),
  clear_VmError_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_VmError_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema, VmErrorCode: z.string().trim().min(2) }),
  }),
  reset_Vm_req: requestEnvelopeSchema.extend({
    name: z.literal('reset_Vm_req'),
    subCode: z.literal('00H'),
    data: z.object({ VmId: id2Schema }).passthrough(),
  }),
  FcInstallStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('FcInstallStatus_req'),
    subCode: z.enum(['00H', '01H', '02H']),
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
    data: z.object({
      TankId: id2Schema,
      DtdPars: z.object({
        EnteredDensity: z.object({
          DensityValue: z
            .string()
            .trim()
            .regex(/^\d{12}$/),
          ExpireDateAndTime: fcDateTimeSchema,
          ScrollingSpeed: code1Schema,
          Text: z.string().max(80),
        }),
      }),
    }),
  }),
  TgErrorMsg_req: requestEnvelopeSchema.extend({
    name: z.literal('TgErrorMsg_req'),
    subCode: z.literal('00H'),
    data: z.object({ TgId: id2Schema }),
  }),

  clear_TgError_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_TgError_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        TgId: id2Schema,
        TgErrorCode: z
          .string()
          .trim()
          .regex(/^\d{2}$/),
      })
      .passthrough(),
  }),
  reset_Tg_req: requestEnvelopeSchema.extend({
    name: z.literal('reset_Tg_req'),
    subCode: z.literal('00H'),
    data: z.object({ TgId: id2Schema }).passthrough(),
  }),

  open_TankController_req: requestEnvelopeSchema.extend({
    name: z.literal('open_TankController_req'),
    subCode: z.literal('00H'),
    data: z.object({
      TankId: id2Schema,
      PosId: id2OrZeroSchema,
      TankOperationModeNo: z.number().int().min(0).max(255),
    }),
  }),
  close_TankController_req: requestEnvelopeSchema.extend({
    name: z.literal('close_TankController_req'),
    subCode: z.literal('00H'),
    data: z.object({ TankId: id2OrZeroSchema }).passthrough(),
  }),
  TankControlStatus_req: requestEnvelopeSchema.extend({
    name: z.literal('TankControlStatus_req'),
    subCode: z.literal('00H'),
    data: z.object({ TankId: id2OrZeroSchema }).passthrough(),
  }),
  block_Tank_req: requestEnvelopeSchema.extend({
    name: z.literal('block_Tank_req'),
    subCode: z.literal('00H'),
    data: z.object({ TankId: id2Schema }).passthrough(),
  }),
  unblock_Tank_req: requestEnvelopeSchema.extend({
    name: z.literal('unblock_Tank_req'),
    subCode: z.literal('00H'),
    data: z.object({ TankId: id2Schema }).passthrough(),
  }),
  start_DeliveryProcess_req: requestEnvelopeSchema.extend({
    name: z.literal('start_DeliveryProcess_req'),
    subCode: z.literal('00H'),
    data: z.object({
      TankId: id2Schema,
      PosId: id2OrZeroSchema,
      FcProductId: id2Schema,
      StartDeliveryProcessPars: z
        .object({
          FcProductName: z.string().optional(),
          TankControlSmId: id2Schema.optional(),
        })
        .passthrough()
        .optional(),
    }),
  }),
  stop_DeliveryProcess_req: requestEnvelopeSchema.extend({
    name: z.literal('stop_DeliveryProcess_req'),
    subCode: z.literal('00H'),
    data: z.object({
      TankId: id2Schema,
      PosId: id2OrZeroSchema,
    }),
  }),
  mark_DeliveryStarting_req: requestEnvelopeSchema.extend({
    name: z.literal('mark_DeliveryStarting_req'),
    subCode: z.literal('00H'),
    data: z.object({ PosId: id2OrZeroSchema }).passthrough(),
  }),
  mark_DeliveryFinished_req: requestEnvelopeSchema.extend({
    name: z.literal('mark_DeliveryFinished_req'),
    subCode: z.literal('00H'),
    data: z.object({ PosId: id2OrZeroSchema }).passthrough(),
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
        PosId: id2OrZeroSchema,
        ZERO: z.literal(0),
        TankDeliveryDataItemId: z.array(id2Schema).min(1),
      })
      .passthrough(),
  }),
  clear_TankDeliveryData_req: requestEnvelopeSchema.extend({
    name: z.literal('clear_TankDeliveryData_req'),
    subCode: z.literal('00H'),
    data: z
      .object({
        PosId: id2OrZeroSchema,
        DeliveryReportSeqNo: dec2OrZeroSchema,
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

export const prepareJplOutboundMessage = (message: unknown) => {
  const envelope = validateJplOutboundMessage(message)
  if (envelope.name === 'heartbeat') return envelope
  if (envelope.correlationId != null) return envelope
  return { ...envelope, correlationId: createCorrelationId() }
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
