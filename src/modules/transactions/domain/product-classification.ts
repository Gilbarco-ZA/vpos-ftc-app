export type FuelProductClassificationInput = {
  productName?: string | null
  product_name?: string | null
  productCode?: string | null
  product_code?: string | null
  categoryName?: string | null
  category_name?: string | null
  category?: string | null
}

const FUEL_PRODUCT_PATTERN =
  /\b(fuel|petrol|diesel|gasoline|gasolina|kerosene|super|unleaded|octane|lpg|cng|ago|pms)\b/i

const text = (value: unknown) => String(value ?? '').trim()

export const isFuelLikeProduct = (
  product: FuelProductClassificationInput | null | undefined,
): boolean => {
  if (!product) return false

  const categories = [
    product.categoryName,
    product.category_name,
    product.category,
  ]
    .map(text)
    .filter(Boolean)

  if (categories.length > 0) {
    return categories.some(
      (category) =>
        category.toUpperCase() === 'FUEL' ||
        FUEL_PRODUCT_PATTERN.test(category),
    )
  }

  return FUEL_PRODUCT_PATTERN.test(
    [
      product.productName,
      product.product_name,
      product.productCode,
      product.product_code,
    ]
      .map(text)
      .filter(Boolean)
      .join(' '),
  )
}
