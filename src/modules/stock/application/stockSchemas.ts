import { z } from 'zod'

import {
  isStockInReason,
  isStockOutReason,
  STOCK_IN_REASONS,
  STOCK_MOVEMENT_TYPES,
  STOCK_OUT_REASONS,
} from '@/src/modules/stock/domain/stockMovement'

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null)

export const createStockMovementSchema = z
  .object({
    productRecordId: z.string().uuid(),
    movementType: z.enum(STOCK_MOVEMENT_TYPES),
    reason: z.union([z.enum(STOCK_IN_REASONS), z.enum(STOCK_OUT_REASONS)]),
    quantity: z.coerce.number().positive().finite().max(999_999_999),
    unitCost: z.coerce
      .number()
      .min(0)
      .finite()
      .max(999_999_999)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    effectiveAt: z.string().datetime({ offset: true }),
    documentReference: optionalTrimmedString(45),
    remarks: optionalTrimmedString(500),
    supplierName: optionalTrimmedString(45),
    supplierPin: optionalTrimmedString(45),
    supplierInvoiceNumber: optionalTrimmedString(45),
  })
  .superRefine((value, ctx) => {
    const effectiveAt = new Date(value.effectiveAt).getTime()
    if (effectiveAt > Date.now() + 5 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveAt'],
        message: 'Effective date and time cannot be in the future.',
      })
    }

    if (value.movementType === 'STOCK_IN' && !isStockInReason(value.reason)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Invalid stock-in reason.',
      })
    }

    if (value.movementType === 'STOCK_OUT' && !isStockOutReason(value.reason)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Invalid stock-out reason.',
      })
    }

    if (value.movementType === 'STOCK_OUT' && !value.documentReference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentReference'],
        message: 'Reference document is required for stock out.',
      })
    }

    if (value.reason === 'Other' && !value.remarks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remarks'],
        message: 'Remarks are required when the reason is Other.',
      })
    }
  })

export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>
