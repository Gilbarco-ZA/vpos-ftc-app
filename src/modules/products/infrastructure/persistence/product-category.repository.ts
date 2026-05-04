import { query, queryAll, queryOne } from '@/src/platform/db/postgres/query'

import { normalizeProductCategoryImagePath } from '@/src/modules/products/infrastructure/storage/product-category-image.storage'

export type ProductCategoryRecord = {
  id: string
  stationId: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  imagePath?: string | null
  sortOrder: number
  isActive: boolean
  productCount?: number
  createdAt?: string | null
  updatedAt?: string | null
}

export const mapProductCategoryRow = (
  row: Record<string, unknown>,
): ProductCategoryRecord => ({
  id: String(row.id ?? ''),
  stationId: String(row.station_id ?? row.stationId ?? ''),
  code: String(row.code ?? ''),
  name: String(row.name ?? ''),
  description: row.description == null ? null : String(row.description),
  icon: row.icon == null ? null : String(row.icon),
  imagePath: normalizeProductCategoryImagePath(
    row.image_path == null && row.imagePath == null
      ? null
      : String(row.image_path ?? row.imagePath),
  ),
  sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
  isActive: Boolean(row.is_active ?? row.isActive ?? true),
  productCount:
    row.product_count == null && row.productCount == null
      ? 0
      : Number(row.product_count ?? row.productCount ?? 0),
  createdAt:
    row.created_at == null && row.createdAt == null
      ? null
      : String(row.created_at ?? row.createdAt),
  updatedAt:
    row.updated_at == null && row.updatedAt == null
      ? null
      : String(row.updated_at ?? row.updatedAt),
})

export async function listProductCategoriesRepo(
  stationId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ProductCategoryRecord[]> {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT
        pc.id,
        pc.station_id,
        pc.code,
        pc.name,
        pc.description,
        pc.icon,
        pc.image_path,
        pc.sort_order,
        pc.is_active,
        pc.created_at,
        pc.updated_at,
        COUNT(p.id)::int AS product_count
      FROM product_categories pc
      LEFT JOIN products p
        ON p.station_id = pc.station_id
       AND p.category_id = pc.id
      WHERE pc.station_id = $1
        AND ($2::boolean = TRUE OR pc.is_active = TRUE)
      GROUP BY pc.id
      ORDER BY pc.sort_order ASC, pc.name ASC`,
    [stationId, Boolean(opts.includeInactive)],
  )

  return rows.map(mapProductCategoryRow)
}

export async function getProductCategoryByIdRepo(
  stationId: string,
  categoryId: string,
): Promise<ProductCategoryRecord | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT
        pc.id,
        pc.station_id,
        pc.code,
        pc.name,
        pc.description,
        pc.icon,
        pc.image_path,
        pc.sort_order,
        pc.is_active,
        pc.created_at,
        pc.updated_at,
        COUNT(p.id)::int AS product_count
      FROM product_categories pc
      LEFT JOIN products p
        ON p.station_id = pc.station_id
       AND p.category_id = pc.id
      WHERE pc.station_id = $1
        AND pc.id = $2
      GROUP BY pc.id`,
    [stationId, categoryId],
  )

  return row ? mapProductCategoryRow(row) : null
}

export async function resolveProductCategoriesByIdsRepo(
  stationId: string,
  categoryIds: string[],
): Promise<Map<string, ProductCategoryRecord>> {
  const uniqueIds = Array.from(
    new Set(
      (Array.isArray(categoryIds) ? categoryIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  )
  if (!uniqueIds.length) return new Map()

  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, station_id, code, name, description, icon, image_path,
            sort_order, is_active, created_at, updated_at
       FROM product_categories
      WHERE station_id = $1
        AND id = ANY($2::uuid[])`,
    [stationId, uniqueIds],
  )

  return new Map(
    rows.map((row) => {
      const mapped = mapProductCategoryRow(row)
      return [mapped.id, mapped] as const
    }),
  )
}

export async function insertProductCategoryRepo(args: {
  id: string
  stationId: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  imagePath?: string | null
  sortOrder?: number | null
  isActive?: boolean | null
}): Promise<ProductCategoryRecord | null> {
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO product_categories (
        id,
        station_id,
        code,
        name,
        description,
        icon,
        image_path,
        sort_order,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      )
      RETURNING *`,
    [
      args.id,
      args.stationId,
      args.code,
      args.name,
      args.description?.trim() || null,
      args.icon?.trim() || null,
      args.imagePath ?? null,
      Number.isFinite(Number(args.sortOrder)) ? Number(args.sortOrder) : 0,
      args.isActive ?? true,
    ],
  )

  return row ? mapProductCategoryRow(row) : null
}

export async function updateProductCategoryRepo(args: {
  stationId: string
  categoryId: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  imagePath?: string | null
  sortOrder: number
  isActive: boolean
}): Promise<ProductCategoryRecord | null> {
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE product_categories
        SET code = $3,
            name = $4,
            description = $5,
            icon = $6,
            image_path = $7,
            sort_order = $8,
            is_active = $9,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING *`,
    [
      args.stationId,
      args.categoryId,
      args.code,
      args.name,
      args.description != null ? String(args.description).trim() || null : null,
      args.icon != null ? String(args.icon).trim() || null : null,
      args.imagePath ?? null,
      args.sortOrder,
      args.isActive,
    ],
  )

  return row ? mapProductCategoryRow(row) : null
}

export async function renameProductsForCategoryRepo(args: {
  stationId: string
  categoryId: string
  categoryName: string
}): Promise<void> {
  await query(
    `UPDATE products
        SET category = $3,
            updated_at = NOW()
      WHERE station_id = $1
        AND category_id = $2`,
    [args.stationId, args.categoryId, args.categoryName],
  )
}

export async function deleteProductCategoryRepo(args: {
  stationId: string
  categoryId: string
}): Promise<void> {
  await query(
    `DELETE FROM product_categories
      WHERE station_id = $1
        AND id = $2`,
    [args.stationId, args.categoryId],
  )
}
