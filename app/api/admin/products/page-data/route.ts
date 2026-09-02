import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import {
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
    const [rows, defaultCurrency, taxTypeOptions] = await Promise.all([
      listProducts({ stationId: user.stationId }),
      getDefaultCurrency(user.station.country),
      getTaxTypeOptions(user.station.country),
    ])

    return ok({
      products: normalizeProductsForDisplay(rows),
      currencyOptions: [defaultCurrency],
      defaultCurrency,
      taxTypeOptions,
      isDevEnv: process.env.NODE_ENV !== 'production',
    })
  },
})
