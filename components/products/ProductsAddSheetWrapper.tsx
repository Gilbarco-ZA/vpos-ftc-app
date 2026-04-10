import { Sheet, SheetContent } from '../ui/sheet'
import { createEmptyForm, ProductsAddSheetWrapperProps } from './products.types'
import { ProductsUpsertSheetContent } from './ProductsUpsertSheetContent'

export const ProductsAddSheetWrapper = ({
  isOpen,
  onOpenChange,
  currencyOptions,
  defaultCurrency,
  taxTypeOptions,
  isDevEnv,
  onSubmit,
  onSuccess,
}: ProductsAddSheetWrapperProps) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-dvh flex-col p-0">
        <ProductsUpsertSheetContent
          title="Add product"
          submitLabel="Save product"
          onClose={() => onOpenChange(false)}
          currencyOptions={currencyOptions}
          defaultCurrency={defaultCurrency}
          taxTypeOptions={taxTypeOptions}
          isDevEnv={isDevEnv}
          initialValues={createEmptyForm(defaultCurrency)}
          onSubmit={onSubmit}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  )
}
