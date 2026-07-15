import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import {
  getCurrencyOptions,
  getDefaultCurrency,
  getTaxTypeOptions,
  normalizeProductsForDisplay,
} from '@/src/modules/products/application/product-display'
import { listProducts } from '@/src/modules/products/application/queries/list-products'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const [rows, currencyOptions, defaultCurrency, taxTypeOptions] =
      await Promise.all([
        listProducts({ stationId: user.stationId }),
        getCurrencyOptions(user.station.country),
        getDefaultCurrency(user.station.country),
        getTaxTypeOptions(user.station.country),
      ])

    return ok({
      products: normalizeProductsForDisplay(rows),
      currencyOptions,
      defaultCurrency,
      taxTypeOptions,
      isDevEnv: process.env.NODE_ENV !== 'production',
    })
  },
})
