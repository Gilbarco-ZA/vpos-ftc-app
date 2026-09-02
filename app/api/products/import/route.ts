import { created, fail } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { importProductsCsv } from '@/src/modules/products/application/importProductsCsv'
import { buildProductImportCsvTemplate } from '@/src/modules/products/application/productCsvImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CSV_BYTES = 5 * 1024 * 1024

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async () => {
    return new Response(buildProductImportCsvTemplate(), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition':
          'attachment; filename="vpos-products-with-stock-template.csv"',
        'cache-control': 'no-store',
      },
    })
  },
})

export const POST = defineMutationRoute<{
  file?: File
  csrf_token?: string
}>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const file = body.file
    if (!(file instanceof File)) {
      return fail('Select a CSV file to import.', 400)
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return fail('Product imports must use a .csv file.', 400)
    }
    if (file.size <= 0) {
      return fail('The selected CSV file is empty.', 400)
    }
    if (file.size > MAX_CSV_BYTES) {
      return fail('CSV file exceeds the 5 MB import limit.', 413)
    }

    const result = await importProductsCsv({
      stationId: user.stationId,
      user,
      csvText: await file.text(),
      fileName: file.name,
    })

    return created(result)
  },
})
