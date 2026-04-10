import { createContext, useContext } from 'react'

import { ProductsUIContextValue } from './products.types'

export const ProductsUIContext = createContext<ProductsUIContextValue | null>(
  null,
)

export const useProductsUI = () => {
  const context = useContext(ProductsUIContext)
  if (!context) throw new Error('Products UI context not available')
  return context
}
