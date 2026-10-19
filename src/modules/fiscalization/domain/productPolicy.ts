import type { CanonicalProduct, ValidationResult } from './countryAdapter'

export interface ProductRegistrationContext {
  createdByName: string
}

export interface ProductPolicy {
  defaultsForFuel(gradeName: string): Partial<CanonicalProduct>
  validate(product: CanonicalProduct): ValidationResult
  buildRegistration(
    products: readonly CanonicalProduct[],
    context: ProductRegistrationContext,
  ): unknown
}

export function collectProductIssues(
  product: CanonicalProduct,
): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = []
  if (!product.id.trim()) issues.push({ field: 'id', message: 'Product ID is required' })
  if (!product.code.trim()) issues.push({ field: 'code', message: 'Product code is required' })
  if (!product.name.trim()) issues.push({ field: 'name', message: 'Product name is required' })
  if (!Number.isFinite(product.price) || product.price < 0) {
    issues.push({ field: 'price', message: 'Product price must be finite and non-negative' })
  }
  return issues
}

export function requireValidProduct(
  policy: ProductPolicy,
  product: CanonicalProduct,
): void {
  const result = policy.validate(product)
  if (!result.valid) {
    throw new Error(result.issues.map((issue) => `${issue.field}: ${issue.message}`).join('; '))
  }
}
