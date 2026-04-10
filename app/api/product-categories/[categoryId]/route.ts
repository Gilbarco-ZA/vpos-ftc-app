import type { SessionUser } from '@/src/shared/types'

import {
  badRequest,
  notFound,
  ok,
  serverError,
} from '@/src/platform/web/api/response'
import { parseInput, readBody } from '@/src/platform/web/api/validation'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import { deleteProductCategory } from '@/src/modules/products/application/commands/delete-product-category'
import { updateProductCategory } from '@/src/modules/products/application/commands/update-product-category'
import { getProductCategoryById } from '@/src/modules/products/application/queries/get-product-category-by-id'
import { isProductCategoryImageFile } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'
import { updateProductCategorySchema } from '@/src/modules/products/infrastructure/validators/product.schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const toBoolean = (value: unknown): boolean | null => {
  if (value == null || value === '') return null
  return String(value).toLowerCase() !== 'false'
}

const toUpdateInput = (categoryId: string, body: Record<string, unknown>) => {
  const imageFile = body.image
  if (
    imageFile &&
    typeof imageFile !== 'string' &&
    !isProductCategoryImageFile(imageFile)
  ) {
    return null
  }

  return {
    categoryId,
    name: body.name == null ? null : String(body.name),
    code: body.code == null ? null : String(body.code),
    description: body.description == null ? null : String(body.description),
    icon: body.icon == null ? null : String(body.icon),
    sortOrder:
      body.sortOrder == null || body.sortOrder === ''
        ? null
        : Number.isFinite(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : null,
    isActive: toBoolean(body.isActive),
    imageFile: isProductCategoryImageFile(imageFile) ? imageFile : null,
  }
}

export const GET = async (
  req: Request,
  { params }: { params: { categoryId: string } },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager', 'tenant'])
    const category = await getProductCategoryById({
      stationId: user.stationId,
      categoryId: params.categoryId,
    })
    if (!category) return notFound('Category not found')
    return ok(category)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const PATCH = async (
  req: Request,
  { params }: { params: { categoryId: string } },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    const normalized = toUpdateInput(params.categoryId, body)
    if (!normalized) {
      return badRequest('Invalid category image payload')
    }

    const updated = await updateProductCategory({
      stationId: user.stationId,
      ...parseInput(normalized, updateProductCategorySchema),
    })

    return ok(updated)
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message === 'Category not found') return notFound(message)
    if (message.toLowerCase().includes('duplicate')) {
      return badRequest('A category with that code or name already exists')
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const DELETE = async (
  req: Request,
  { params }: { params: { categoryId: string } },
) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const body = await readBody(req)
    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    return ok(
      await deleteProductCategory({
        stationId: user.stationId,
        categoryId: params.categoryId,
      }),
    )
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message === 'Category not found') return notFound(message)
    if (message === 'Reassign products before deleting this category') {
      return badRequest(message)
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
