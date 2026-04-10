import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from 'next/server'

import {
  queryAll as pgAll,
  queryOne as pgOne,
} from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { getBrandingSettings } from '@/src/shared/branding/settings'
import { normalizeReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'

export const dynamic = 'force-dynamic'

const firstNonEmpty = (...values: Array<any>) => {
  for (const value of values) {
    const str = String(value ?? '').trim()
    if (str.length) return str
  }
  return undefined
}

const decimalValue = (value: any) =>
  typeof value === 'number' ? value : undefined

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { searchParams } = new URL(req.url)
    const transactionId = (searchParams.get('transactionId') || '').trim()
    const listMode = (searchParams.get('list') || '').trim() === '1'

    if (transactionId && !listMode) {
      const transaction = await pgOne<any>(
        `
        SELECT t.*, c.buyer_name, c.tin, c.pin
        FROM transactions t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.station_id = $1
          AND t.deleted_at IS NULL
          AND t.id::text = $2
        LIMIT 1
        `,
        [user.stationId, transactionId],
      )

      if (!transaction) {
        return NextResponse.json(
          { ok: false, error: 'Transaction not found' },
          { status: 404 },
        )
      }

      const [station, taxPinKv, siteProfile, transactionLines, branding] =
        await Promise.all([
          pgOne<any>(`SELECT * FROM fuel_stations WHERE id = $1`, [
            user.stationId,
          ]),
          kvGet<any>(user.stationId, 'tax_pin'),
          kvGet<any>(user.stationId, KV_KEYS.SITE_PROFILE),
          pgAll<any>(
            `
          SELECT
            tl.quantity,
            COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price) AS unit_price,
            (tl.quantity * COALESCE(p.ext_unit_price, tl.unit_price, p.unit_price)) AS line_total,
            p.product_name,
            p.tax_code,
            p.ext_tax_code
          FROM transaction_lines tl
          LEFT JOIN products p
            ON p.id = tl.product_id
            AND p.station_id = $1
          WHERE tl.transaction_id = $2::uuid
          ORDER BY tl.created_at ASC
          `,
            [user.stationId, transaction.id],
          ),
          getBrandingSettings(user.stationId),
        ])

      const stationSettings = await pgOne<any>(
        `SELECT volume_decimals, money_decimals, unit_price_decimals FROM station_settings WHERE station_id = $1`,
        [user.stationId],
      )

      const stationTaxNumber = firstNonEmpty(
        station?.tin,
        station?.tax_pin,
        station?.taxPin,
        siteProfile?.taxNumber,
        taxPinKv?.tin,
        taxPinKv?.tax_pin,
        taxPinKv?.pin,
      )
      const stationPin = firstNonEmpty(
        station?.pin,
        taxPinKv?.pin,
        taxPinKv?.tax_pin,
      )

      const rawResponse = transaction?.fiscalization_response
      const receipt = normalizeReceipt({
        transaction,
        stationName: station?.name,
        station,
        stationTaxNumber,
        stationPin,
        transactionLines,
        raw: rawResponse,
        attendantName: user?.fullName || user?.username || undefined,
        decimalOverrides: {
          volume: decimalValue(stationSettings?.volume_decimals),
          money: decimalValue(stationSettings?.money_decimals),
          unitPrice: decimalValue(stationSettings?.unit_price_decimals),
        },
        branding: branding
          ? {
              logoPath: (branding as any)?.logo_path ?? null,
              primaryColor: (branding as any)?.primary_color ?? null,
              secondaryColor: (branding as any)?.secondary_color ?? null,
              stationDisplayName:
                (branding as any)?.station_display_name ?? null,
              receiptHeaderText: (branding as any)?.receipt_header_text ?? null,
              receiptFooterText: (branding as any)?.receipt_footer_text ?? null,
            }
          : undefined,
      })

      if (!receipt) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Receipt not found in fiscalization_response',
            raw: rawResponse ?? null,
          },
          { status: 404 },
        )
      }

      const payload: {
        ok: true
        receipt: NormalizedReceipt
        raw?: any
        voided?: boolean
        voidedAt?: string | null
      } = {
        ok: true,
        receipt,
        raw: rawResponse ?? null,
      }

      // Check if the receipt has been voided (credit note issued)
      try {
        const voidedRow = await pgOne<{ voided_at: string | null }>(
          `SELECT voided_at FROM receipts WHERE station_id = $1 AND transaction_id = $2::uuid AND voided_at IS NOT NULL LIMIT 1`,
          [user.stationId, transactionId],
        )
        if (voidedRow?.voided_at) {
          payload.voided = true
          payload.voidedAt = voidedRow.voided_at
        }
      } catch {
        // voided_at column may not exist if migration 047 has not been applied
      }

      return NextResponse.json(payload)
    }

    const rows = await pgAll<any>(
      `
      SELECT r.*
      FROM receipts r
      WHERE r.station_id = $1
        AND ($2 = '' OR r.transaction_id = $2::uuid)
      ORDER BY r.generated_at DESC
      LIMIT 200
      `,
      [user.stationId, transactionId],
    )

    return ok(rows)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
