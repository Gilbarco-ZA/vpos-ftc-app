import { TZ_DATASET } from '@/src/shared/config/datasets/TZ'

import type { CanonicalProduct, ValidationIssue, ValidationResult } from '../../domain/countryAdapter'
import { collectProductIssues, requireValidProduct } from '../../domain/productPolicy'
import type { ProductPolicy, ProductRegistrationContext } from '../../domain/productPolicy'

const CLASS_CODES = new Set(TZ_DATASET.productClassCodes.map((row) => row.code))
const TYPE_CODES = new Set(TZ_DATASET.productTypeCodes.map((row) => row.code))
const TAX_CODES = new Set(TZ_DATASET.taxTypes.map((row) => row.code))

export const tanzaniaProductPolicy: ProductPolicy = {
  defaultsForFuel(gradeName) {
    const name = gradeName.toUpperCase()
    const typeCode = /DIESEL|AGO/.test(name)
      ? 'DIESEL'
      : /KEROSENE/.test(name)
        ? 'KEROSENE'
        : /PETROL|GASOLINE|UNLEADED|ULP/.test(name)
          ? 'PETROL'
          : undefined
    return {
      classCode: 'FUEL',
      ...(typeCode ? { typeCode } : {}),
      taxCode: 'A',
      currency: 'TZS',
      unitOfMeasure: 'L',
    }
  },
  validate(product): ValidationResult {
    const issues: ValidationIssue[] = collectProductIssues(product)
    if (!CLASS_CODES.has(String(product.classCode ?? ''))) {
      issues.push({ field: 'classCode', message: 'Unknown Tanzania product class' })
    }
    if (!TYPE_CODES.has(String(product.typeCode ?? ''))) {
      issues.push({ field: 'typeCode', message: 'Unknown Tanzania product type' })
    }
    if (!TAX_CODES.has(String(product.taxCode ?? ''))) {
      issues.push({ field: 'taxCode', message: 'Unknown Tanzania tax code' })
    }
    if (product.currency.trim().toUpperCase() !== 'TZS') {
      issues.push({ field: 'currency', message: 'Tanzania registration requires TZS' })
    }
    return issues.length ? { valid: false, issues } : { valid: true }
  },
  buildRegistration(products: readonly CanonicalProduct[], _context: ProductRegistrationContext) {
    for (const product of products) requireValidProduct(this, product)
    // Existing Tanzania proxy flow uses one product per request.
    return products.map((product) => ({
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      unitPrice: product.price,
      currency: product.currency,
      category: product.classCode === 'FUEL' ? 'Fuel' : product.classCode,
      taxCode: product.taxCode,
      taxRate: TZ_DATASET.taxTypes.find((tax) => tax.code === product.taxCode)?.rate ?? 0,
      inUse: true,
    }))
  },
}
