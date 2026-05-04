import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const countTable = async (table: string) => {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(1)::text AS count FROM ${table}`,
  )
  return Number(row?.count || 0)
}

const sampleRows = async (table: string) => {
  return await queryAll<Record<string, unknown>>(
    `SELECT code, name, description, is_active, sort_order
     FROM ${table}
     ORDER BY sort_order ASC, name ASC
     LIMIT 5`,
  )
}

const sampleTaxRows = async () => {
  return await queryAll<Record<string, unknown>>(
    `SELECT code, name, description, rate, is_active, sort_order
     FROM cfg_tax_types
     ORDER BY sort_order ASC, name ASC
     LIMIT 5`,
  )
}

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])

    const [
      taxTypesCount,
      productClassCount,
      productTypeCount,
      creditNoteCount,
      packagingUnitsCount,
      quantityUnitsCount,
      taxSamples,
      productClassSamples,
      productTypeSamples,
      creditNoteSamples,
      packagingUnitSamples,
      quantityUnitSamples,
    ] = await Promise.all([
      countTable('cfg_tax_types'),
      countTable('cfg_product_class_codes'),
      countTable('cfg_product_type_codes'),
      countTable('cfg_credit_note_reasons'),
      countTable('cfg_pack_sizes'),
      countTable('cfg_units_of_measure'),
      sampleTaxRows(),
      sampleRows('cfg_product_class_codes'),
      sampleRows('cfg_product_type_codes'),
      sampleRows('cfg_credit_note_reasons'),
      sampleRows('cfg_pack_sizes'),
      sampleRows('cfg_units_of_measure'),
    ])

    return NextResponse.json({
      ok: true,
      data: {
        counts: {
          cfg_tax_types: taxTypesCount,
          cfg_product_class_codes: productClassCount,
          cfg_product_type_codes: productTypeCount,
          cfg_credit_note_reasons: creditNoteCount,
          cfg_pack_sizes: packagingUnitsCount,
          cfg_units_of_measure: quantityUnitsCount,
        },
        samples: {
          cfg_tax_types: taxSamples,
          cfg_product_class_codes: productClassSamples,
          cfg_product_type_codes: productTypeSamples,
          cfg_credit_note_reasons: creditNoteSamples,
          cfg_pack_sizes: packagingUnitSamples,
          cfg_units_of_measure: quantityUnitSamples,
        },
      },
    })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
