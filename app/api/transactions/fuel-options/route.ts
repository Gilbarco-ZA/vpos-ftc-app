import { queryAll } from '@/src/platform/db/postgres'
import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const rows = await queryAll<any>(
      `SELECT p.id AS "pumpId",
              p.pump_number AS "pumpNumber",
              n.id AS "nozzleId",
              n.nozzle_number AS "nozzleNumber",
              t.id AS "tankId",
              COALESCE(t.name, t.code, 'Tank') AS "tankName",
              pr.id AS "productRowId",
              COALESCE(pr.product_id, pr.product_code, pr.id::text) AS "gradeId",
              COALESCE(pr.product_name, pr.product_code, t.name, 'Fuel') AS "gradeName",
              pr.product_code AS "productCode"
         FROM pumps p
         JOIN nozzles n
           ON n.pump_id = p.id
          AND n.station_id = p.station_id
         JOIN tanks t
           ON t.id = n.tank_id
          AND t.station_id = n.station_id
         LEFT JOIN products pr
           ON pr.id = t.product_id
          AND pr.station_id = t.station_id
        WHERE p.station_id = $1
        ORDER BY p.pump_number ASC, n.nozzle_number ASC`,
      [user.stationId],
    )

    return ok({
      options: rows.map((row) => ({
        pumpId: row.pumpId ? String(row.pumpId) : null,
        pumpNumber: Number(row.pumpNumber ?? 0),
        nozzleId: row.nozzleId ? String(row.nozzleId) : null,
        nozzleNumber:
          row.nozzleNumber == null ? null : Number(row.nozzleNumber),
        tankId: row.tankId ? String(row.tankId) : null,
        tankName: row.tankName ? String(row.tankName) : null,
        productRowId: row.productRowId ? String(row.productRowId) : null,
        gradeId: row.gradeId ? String(row.gradeId) : null,
        gradeName: row.gradeName ? String(row.gradeName) : null,
        productCode: row.productCode ? String(row.productCode) : null,
      })),
    })
  },
})
