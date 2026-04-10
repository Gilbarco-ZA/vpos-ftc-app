import type { ProductCategoryRecord } from '@/src/modules/products/infrastructure/persistence/product-category.repository'
import type { ProductCategoryImageFile } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'

import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  deleteProductCategoryRepo,
  getProductCategoryByIdRepo,
  insertProductCategoryRepo,
  renameProductsForCategoryRepo,
  updateProductCategoryRepo,
} from '@/src/modules/products/infrastructure/persistence/product-category.repository'
import { persistProductCategoryImage } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'

const normalizeCode = (value: string) => {
  const base = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return base.slice(0, 48)
}

const fallbackCodeFromName = (name: string) => {
  const base = normalizeCode(name)
  const suffix = Buffer.from(String(name || '').trim())
    .toString('hex')
    .slice(0, 6)
    .toUpperCase()
  return `${base}_${suffix || '000000'}`.slice(0, 80)
}

export async function uploadProductCategoryImage(params: {
  categoryId: string
  imageFile: ProductCategoryImageFile
}): Promise<string> {
  return await persistProductCategoryImage(params.imageFile, params.categoryId)
}

export async function createProductCategoryService(args: {
  stationId: string
  name: string
  code?: string | null
  description?: string | null
  icon?: string | null
  sortOrder?: number | null
  isActive?: boolean | null
  imageFile?: ProductCategoryImageFile | null
}): Promise<ProductCategoryRecord | null> {
  const name = String(args.name || '').trim()
  if (!name) throw new Error('Category name is required')

  const categoryId = uuidv4()
  const code = normalizeCode(args.code || '') || fallbackCodeFromName(name)
  const imagePath =
    args.imageFile && typeof args.imageFile.arrayBuffer === 'function'
      ? await uploadProductCategoryImage({
          categoryId,
          imageFile: args.imageFile,
        })
      : null

  return await insertProductCategoryRepo({
    id: categoryId,
    stationId: args.stationId,
    code,
    name,
    description: args.description?.trim() || null,
    icon: args.icon?.trim() || null,
    imagePath,
    sortOrder: Number.isFinite(Number(args.sortOrder))
      ? Number(args.sortOrder)
      : 0,
    isActive: args.isActive ?? true,
  })
}

export async function updateProductCategoryService(args: {
  stationId: string
  categoryId: string
  name?: string | null
  code?: string | null
  description?: string | null
  icon?: string | null
  sortOrder?: number | null
  isActive?: boolean | null
  imageFile?: ProductCategoryImageFile | null
}): Promise<ProductCategoryRecord | null> {
  const current = await getProductCategoryByIdRepo(
    args.stationId,
    args.categoryId,
  )
  if (!current) throw new Error('Category not found')

  const nextName = String(args.name ?? current.name).trim()
  if (!nextName) throw new Error('Category name is required')

  const nextCode =
    normalizeCode(args.code ?? current.code) || fallbackCodeFromName(nextName)
  const nextImagePath =
    args.imageFile && typeof args.imageFile.arrayBuffer === 'function'
      ? await uploadProductCategoryImage({
          categoryId: args.categoryId,
          imageFile: args.imageFile,
        })
      : (current.imagePath ?? null)

  const updated = await updateProductCategoryRepo({
    stationId: args.stationId,
    categoryId: args.categoryId,
    code: nextCode,
    name: nextName,
    description:
      args.description != null
        ? String(args.description).trim() || null
        : (current.description ?? null),
    icon:
      args.icon != null
        ? String(args.icon).trim() || null
        : (current.icon ?? null),
    imagePath: nextImagePath,
    sortOrder: Number.isFinite(Number(args.sortOrder))
      ? Number(args.sortOrder)
      : current.sortOrder,
    isActive: args.isActive ?? current.isActive,
  })

  await renameProductsForCategoryRepo({
    stationId: args.stationId,
    categoryId: args.categoryId,
    categoryName: nextName,
  })

  return updated
}

export async function deleteProductCategoryService(args: {
  stationId: string
  categoryId: string
}): Promise<{ deleted: true }> {
  const category = await getProductCategoryByIdRepo(
    args.stationId,
    args.categoryId,
  )
  if (!category) throw new Error('Category not found')
  if ((category.productCount ?? 0) > 0) {
    throw new Error('Reassign products before deleting this category')
  }

  await deleteProductCategoryRepo({
    stationId: args.stationId,
    categoryId: args.categoryId,
  })

  return { deleted: true }
}
