import * as fs from 'fs/promises'
import path from 'path'

import { getPrimaryDataRoot } from '@/src/platform/config/app-config'

export const MAX_PRODUCT_CATEGORY_IMAGE_BYTES = 2 * 1024 * 1024
export const PRODUCT_CATEGORY_ASSET_ROUTE_BASE = '/api/category-assets'

export const normalizeProductCategoryImagePath = (
  pathValue: string | null | undefined,
): string | null => {
  const normalized = String(pathValue ?? '').trim()
  if (!normalized) return null
  if (normalized.startsWith(`${PRODUCT_CATEGORY_ASSET_ROUTE_BASE}/`))
    return normalized
  if (normalized.startsWith('/category-assets/')) {
    return `${PRODUCT_CATEGORY_ASSET_ROUTE_BASE}/${normalized.split('/').pop()}`
  }
  return normalized
}

export type ProductCategoryImageFile = {
  arrayBuffer: () => Promise<ArrayBuffer>
  name?: string
  type?: string
}

export function isProductCategoryImageFile(
  value: unknown,
): value is ProductCategoryImageFile {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  )
}

export const resolveProductCategoryAssetsDir = (): string => {
  return path.join(getPrimaryDataRoot(), 'product-categories')
}

const detectImageExt = (file: ProductCategoryImageFile): string | null => {
  const type = file.type
  const name = file.name

  const byType: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
  }
  if (type && byType[type]) return byType[type]

  if (name) {
    const ext = path.extname(name).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext
    }
  }

  return null
}

export async function persistProductCategoryImage(
  file: ProductCategoryImageFile,
  categoryId: string,
): Promise<string> {
  const ext = detectImageExt(file)
  if (!ext) throw new Error('Unsupported category image type')

  const ab = await file.arrayBuffer()
  const buffer = Buffer.from(ab)
  if (buffer.byteLength > MAX_PRODUCT_CATEGORY_IMAGE_BYTES) {
    throw new Error('Category image exceeds maximum size of 2MB')
  }

  const dir = resolveProductCategoryAssetsDir()
  await fs.mkdir(dir, { recursive: true })

  const basename = `category-${categoryId}${ext}`
  const absolutePath = path.join(dir, basename)

  const existing = await fs.readdir(dir).catch(() => [])
  await Promise.all(
    existing
      .filter((entry) => entry.startsWith(`category-${categoryId}.`))
      .map((entry) => fs.unlink(path.join(dir, entry)).catch(() => null)),
  )

  await fs.writeFile(absolutePath, buffer)
  return `${PRODUCT_CATEGORY_ASSET_ROUTE_BASE}/${basename}`
}
