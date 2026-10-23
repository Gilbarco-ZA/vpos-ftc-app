import { KE_DATASET } from '@/src/shared/config/datasets/KE'

import type { CanonicalProduct, ValidationIssue, ValidationResult } from '../../domain/countryAdapter'
import { collectProductIssues, requireValidProduct } from '../../domain/productPolicy'
import type { ProductPolicy, ProductRegistrationContext } from '../../domain/productPolicy'

const TYPES = new Set(['1', '2', '3'])
const TYPE_ALIASES: Record<string, string> = {
  RAW_MATERIAL: '1',
  PRODUCT: '2',
  SERVICE: '3',
}
const TAX_CODES = new Set(['A', 'B', 'C', 'D', 'E'])
const CLASS_CODES = new Set(KE_DATASET.productClassCodes.map((row) => row.code))

export function normalizeKenyaProductType(value: string | null | undefined): string {
  const code = String(value ?? '').trim().toUpperCase()
  return TYPE_ALIASES[code] ?? code
}

/**
 * Import suggestions, not guaranteed legal classifications.
 * Unknown fuel names deliberately require operator classification.
 */
export function kenyaFuelDefaults(name: string): Partial<CanonicalProduct> {
  const normalized = name.trim().toUpperCase()
  let classCode: string | undefined
  if (/\b(DIESEL|AGO|GAS[ -]?OIL)\b/.test(normalized)) {
    // The supplied Diesel 50 sample uses the regular gasoline class.
    classCode = '9901300102'
  } else if (/\b(PETROL|GASOLINE|UNLEADED|ULP)\b/.test(normalized)) {
    classCode = /\b(95|97|98|PREMIUM|SUPER)\b/.test(normalized)
      ? '9901300103'
      : '9901300102'
  }
  return {
    ...(classCode ? { classCode } : {}),
    typeCode: '2',
    taxCode: 'B',
    currency: 'KES',
    unitOfMeasure: 'L',
    unitOfPackaging: 'TY',
    hazardousIndicator: true,
  }
}

export const kenyaProductPolicy: ProductPolicy = {
  defaultsForFuel: kenyaFuelDefaults,
  validate(product): ValidationResult {
    const issues: ValidationIssue[] = collectProductIssues(product)
    const type = normalizeKenyaProductType(product.typeCode)
    if (!TYPES.has(type)) {
      issues.push({ field: 'typeCode', message: 'Kenya type must be 1, 2, 3, RAW_MATERIAL, PRODUCT or SERVICE' })
    }
    if (!TAX_CODES.has(String(product.taxCode ?? '').trim().toUpperCase())) {
      issues.push({ field: 'taxCode', message: 'Kenya tax code must be A, B, C, D or E' })
    }
    if (!CLASS_CODES.has(String(product.classCode ?? '').trim())) {
      issues.push({ field: 'classCode', message: 'Select a registered Kenya product class code' })
    }
    if (product.currency.trim().toUpperCase() !== 'KES') {
      issues.push({ field: 'currency', message: 'Kenya registration requires KES' })
    }
    return issues.length ? { valid: false, issues } : { valid: true }
  },
  buildRegistration(products: readonly CanonicalProduct[], context: ProductRegistrationContext) {
    if (!context.createdByName.trim()) throw new Error('createdByName is required')
    for (const product of products) requireValidProduct(this, product)
    return {
      products: products.map((product) => ({
        createdByName: context.createdByName.trim(),
        productId: product.id,
        productCode: product.code,
        productClassCode: product.classCode,
        productTypeCode: normalizeKenyaProductType(product.typeCode),
        productName: product.name,
        unitOfMeasure: product.unitOfMeasure ?? null,
        unitOfPackaging: product.unitOfPackaging ?? null,
        unitPrice: product.price,
        currency: 'KES',
        taxCode: String(product.taxCode).trim().toUpperCase(),
        ...(product.taxRate != null ? { taxRate: product.taxRate } : {}),
        hazardousIndicator: product.hazardousIndicator ?? false,
      })),
    }
  },
}
