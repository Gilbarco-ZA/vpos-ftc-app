import type { ProductCategoryImageFile } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'
import { z } from 'zod'

import { isProductCategoryImageFile } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'

export const productCategoryImageFileSchema = z.custom<
  ProductCategoryImageFile | null | undefined
>((value) => value == null || isProductCategoryImageFile(value))

export const createProductCategorySchema = z.object({
  name: z.string(),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  imageFile: productCategoryImageFileSchema.optional(),
})

export const updateProductCategorySchema = z.object({
  categoryId: z.string(),
  name: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
  imageFile: productCategoryImageFileSchema.optional(),
})

export const deleteProductCategorySchema = z.object({
  categoryId: z.string(),
})

export const createProductSchema = z.object({
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

export const updateProductSchema = createProductSchema.extend({
  productId: z.string().min(1, 'Product ID is required'),
})

export const updateProductStatusSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  status: z.enum(['pending', 'synced', 'failed', 'skipped']),
  message: z.string().nullable().optional(),
})

export type ProductCreateInput = z.infer<typeof createProductSchema>
export type ProductUpdateInput = z.infer<typeof updateProductSchema>

export const productCreateSchema = createProductSchema
export const productUpdateSchema = updateProductSchema
