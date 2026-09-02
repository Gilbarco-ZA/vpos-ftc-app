import type { SessionUser } from '@/src/shared/types'

import { badRequest, ok, serverError } from '@/src/platform/web/api/response'
import { parseInput, readBody } from '@/src/platform/web/api/validation'
import { requireAuth } from '@/src/shared/auth'
import { requireCsrfFromParts } from '@/src/shared/security/csrf'

import { isProductCategoryImageFile } from '@/src/modules/products/application/categoryAssets'
import { createProductCategory } from '@/src/modules/products/application/commands/create-product-category'
import { createProductCategorySchema } from '@/src/modules/products/application/productSchemas'
import { listProductCategories } from '@/src/modules/products/application/queries/list-product-categories'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const toBoolean = (value: unknown, fallback: boolean) => {
  if (value == null || value === '') return fallback
  return String(value).toLowerCase() !== 'false'
}

const toCreateInput = (body: Record<string, unknown>) => {
  const imageFile = body.image
  if (
    imageFile &&
    typeof imageFile !== 'string' &&
    !isProductCategoryImageFile(imageFile)
  ) {
    return null
  }

  return {
    name: String(body.name || '').trim(),
    code: String(body.code || '').trim() || null,
    description: String(body.description || '').trim() || null,
    icon: String(body.icon || '').trim() || null,
    sortOrder:
      body.sortOrder == null || body.sortOrder === ''
        ? 0
        : Number.isFinite(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : 0,
    isActive: toBoolean(body.isActive, true),
    imageFile: isProductCategoryImageFile(imageFile) ? imageFile : null,
  }
}

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager', 'tenant'])
    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    return ok(
      await listProductCategories({
        stationId: user.stationId,
        includeInactive,
      }),
    )
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    const body = await readBody(req)

    requireCsrfFromParts({
      headerToken: req.headers.get('x-csrf-token'),
      bodyToken: body?.csrf_token,
    })

    const normalized = toCreateInput(body)
    if (!normalized) {
      return badRequest('Invalid category image payload')
    }

    const created = await createProductCategory({
      stationId: user.stationId,
      ...parseInput(normalized, createProductCategorySchema),
    })

    return ok(created)
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message.toLowerCase().includes('duplicate')) {
      return badRequest('A category with that code or name already exists')
    }
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
