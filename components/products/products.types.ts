import { ToastVariant } from '../ui/toast'
import { ProductsUpsertSheetContentProps } from './ProductsUpsertSheetContent'

export type ProductStatus = 'SYNCED' | 'PENDING' | 'FAILED' | 'UNKNOWN'

export type ConfigOption = {
  code: string
  name: string
  description?: string | null
  rate?: number | null
  icon?: string | null
  imagePath?: string | null
  id?: string | null
  sortOrder?: number | null
  isActive?: boolean | null
  productCount?: number | null
}

export type ProductListItem = {
  id: string
  name: string
  code: string
  sku?: string
  unitPrice: number
  currency: string
  lastSyncStatus?: ProductStatus
  lastSynced: string | null
}

export type ProductStatusPayload = {
  status?: string
  lastStatusTime?: string
  revenueAuthorityReference?: string
  revenueAuthorityMessage?: string
  message?: string
  error?: string
}

export type ProductEventLogItem = {
  dateTime?: string
  status?: string
  statusCode?: string
  statusMessage?: string
  revenueAuthorityMessage?: string
}

export type ProductsUIContextValue = {
  openAdd: () => void
  closeAdd: () => void
  openCategories: () => void
  addProduct: (product: ProductListItem) => void
  showToast: (type: ToastVariant, message: string) => void
}

export type AddProductFormState = {
  productName: string
  productCode: string
  productId: string
  productClassCode: string
  productTypeCode: string
  unitPrice: string
  unitCost: string
  currency: string
  taxRate: string
  sku: string
  barcode: string
  category: string
  categoryId: string
  unitOfMeasure: string
  unitOfPackaging: string
  packSize: string
  taxCode: string
  commodityCode: string
  hazardousIndicator: boolean
  extProductId: string
  extProductCode: string
  extProductClassCode: string
  extProductTypeCode: string
  extDescription: string
  extUnitOfMeasure: string
  extUnitOfPackaging: string
  extUnitPrice: string
  extCurrency: string
  extTaxCode: string
  extHazardousIndicator: boolean
  devFlowOverride: '' | 'offline' | 'timeout'
}

export type AddProductFormErrors = Partial<
  Record<keyof AddProductFormState, string>
>

export const createEmptyForm = (
  defaultCurrency: string,
): AddProductFormState => ({
  productName: '',
  productCode: '',
  productId: '',
  productClassCode: '',
  productTypeCode: '',
  unitPrice: '',
  unitCost: '',
  currency: defaultCurrency,
  taxRate: '16',
  sku: '',
  barcode: '',
  category: '',
  categoryId: '',
  unitOfMeasure: '',
  unitOfPackaging: '',
  packSize: '',
  taxCode: '',
  commodityCode: '',
  hazardousIndicator: false,
  extProductId: '',
  extProductCode: '',
  extProductClassCode: '',
  extProductTypeCode: '',
  extDescription: '',
  extUnitOfMeasure: '',
  extUnitOfPackaging: '',
  extUnitPrice: '',
  extCurrency: defaultCurrency,
  extTaxCode: '',
  extHazardousIndicator: false,
  devFlowOverride: '',
})

export const buildPayload = (form: AddProductFormState) => {
  const extProductCode = form.extProductCode.trim() || form.productCode.trim()
  const extProductId =
    form.extProductId.trim() ||
    extProductCode ||
    form.productId.trim() ||
    extProductCode

  const extDescription = form.extDescription.trim() || form.productName.trim()

  const extProductClassCode =
    form.extProductClassCode.trim() || form.productClassCode.trim()
  const extProductTypeCode =
    form.extProductTypeCode.trim() || form.productTypeCode.trim()

  const extUnitOfMeasure =
    form.extUnitOfMeasure.trim() || form.unitOfMeasure.trim() || undefined
  const extUnitOfPackaging =
    form.extUnitOfPackaging.trim() || form.unitOfPackaging.trim() || undefined

  const extUnitPriceRaw = form.extUnitPrice.trim() || form.unitPrice.trim()
  const extUnitPrice = extUnitPriceRaw ? Number(extUnitPriceRaw) : undefined

  const extCurrency = form.extCurrency.trim() || form.currency.trim()
  const extTaxCode = form.extTaxCode.trim() || form.taxCode.trim() || undefined
  const extHazardousIndicator =
    form.extHazardousIndicator ?? form.hazardousIndicator ?? false

  return {
    // Base fields are the *serving-machine/local* identifiers.
    // IMPORTANT: Do not overwrite these with ext_* values on edit, otherwise the API upsert
    // (ON CONFLICT station_id, product_id) will miss and create a new row.
    productId: form.productId.trim() || extProductId,
    productCode: form.productCode.trim() || extProductCode,
    productName: form.productName.trim() || extDescription,
    productClassCode: form.productClassCode.trim() || extProductClassCode,
    productTypeCode: form.productTypeCode.trim() || extProductTypeCode,

    unitPrice: Number(
      form.unitPrice.trim() ||
        (extUnitPrice != null ? String(extUnitPrice) : '') ||
        0,
    ),
    unitCost: Number(form.unitCost || 0),
    currency: form.currency.trim() || extCurrency,
    taxRate: Number(form.taxRate),

    sku: form.sku.trim() || undefined,
    barcode: form.barcode.trim() || undefined,
    categoryId: form.categoryId.trim() || undefined,
    category: form.category.trim() || undefined,
    unitOfMeasure: form.unitOfMeasure.trim() || undefined,
    unitOfPackaging: form.unitOfPackaging.trim() || undefined,
    packSize: form.packSize ? Number(form.packSize) : undefined,
    taxCode: form.taxCode.trim(),
    commodityCode: form.commodityCode.trim() || undefined,
    hazardousIndicator: form.hazardousIndicator,
    devFlowOverride: form.devFlowOverride ? form.devFlowOverride : undefined,

    // External override fields used for proxy/cloud sync + invoice fiscalization
    extProductId,
    extProductCode,
    extProductClassCode,
    extProductTypeCode,
    extDescription,
    extUnitOfMeasure,
    extUnitOfPackaging,
    extUnitPrice,
    extCurrency,
    extTaxCode,
    extHazardousIndicator,
  }
}

export type ProductsAddSheetWrapperProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  currencyOptions: string[]
  defaultCurrency: string
  taxTypeOptions: ConfigOption[]
  isDevEnv: boolean
  onSubmit: ProductsUpsertSheetContentProps['onSubmit']
  onSuccess?: ProductsUpsertSheetContentProps['onSuccess']
}
