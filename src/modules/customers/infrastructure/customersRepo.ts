import {
  query,
  queryAll,
  queryOne,
  txQuery,
  withTransaction,
} from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type CustomerRow = Record<string, any>

export function mapCustomerRow(row: any) {
  return {
    id: String(row.id),
    tin: String(row.tin ?? ''),
    buyerName: String(row.buyer_name ?? ''),
    buyerType: row.buyer_type ?? null,
    pin: row.pin ?? null,
    passportNumber: row.passport_number ?? null,
    businessName: row.business_name ?? null,
    taxNinbrn: row.tax_ninbrn ?? null,
    contactPhone: row.contact_phone ?? null,
    contactMobile: row.contact_mobile ?? null,
    contactFax: row.contact_fax ?? null,
    contactEmail: row.contact_email ?? null,
    contactWebsite: row.contact_website ?? null,
    contactPerson: row.contact_person ?? null,
    addressStreet: row.address_street ?? null,
    addressCity: row.address_city ?? null,
    addressState: row.address_state ?? null,
    addressProvince: row.address_province ?? null,
    addressPostalCode: row.address_postal_code ?? null,
    addressCountryCode: row.address_country_code ?? null,
    country: row.country ?? null,
    odometer: row.odometer ?? null,
    vehicleRegNr: row.vehicle_reg_nr ?? null,
    paymentType: row.payment_type ?? null,
    lastStationId: row.last_station_id ?? null,
    lastSeenAt: row.last_seen_at ?? null,
  }
}

function buildListWhere(params: {
  stationId: string
  q?: string
  country?: string
  buyerType?: string
  includeDeleted?: boolean
}) {
  const clauses: string[] = ['cs.station_id = $1']
  const values: any[] = [params.stationId]

  if (!params.includeDeleted) {
    clauses.push('c.deleted_at IS NULL')
  }

  if (params.q) {
    const idx = values.length + 1
    clauses.push(`(
      c.buyer_name ILIKE '%' || $${idx} || '%'
      OR c.tin ILIKE '%' || $${idx} || '%'
      OR c.contact_email ILIKE '%' || $${idx} || '%'
      OR c.contact_phone ILIKE '%' || $${idx} || '%'
      OR c.contact_mobile ILIKE '%' || $${idx} || '%'
    )`)
    values.push(params.q)
  }

  if (params.country) {
    clauses.push(`c.country = $${values.length + 1}`)
    values.push(params.country)
  }

  if (params.buyerType) {
    clauses.push(`c.buyer_type = $${values.length + 1}`)
    values.push(params.buyerType)
  }

  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    values,
  }
}

export async function listCustomersRepo(params: {
  stationId: string
  q?: string
  country?: string
  buyerType?: string
  includeDeleted?: boolean
  page: number
  pageSize: number
}) {
  const offset = (params.page - 1) * params.pageSize
  const { whereSql, values } = buildListWhere(params)
  const rows = await queryAll<any>(
    `
    SELECT c.id,
           c.buyer_name,
           c.tin,
           c.buyer_type,
           c.contact_email,
           c.contact_phone,
           c.contact_mobile,
           c.country,
           c.odometer,
           c.vehicle_reg_nr,
           c.payment_type,
           c.last_seen_at,
           c.deleted_at
    FROM customers c
    JOIN customer_stations cs ON cs.customer_id = c.id
    ${whereSql}
    ORDER BY cs.last_seen_at DESC NULLS LAST, c.buyer_name ASC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
    `,
    [...values, params.pageSize, offset],
  )

  const count = await queryOne<{ count: string }>(
    `
    SELECT COUNT(*)::text as count
    FROM customers c
    JOIN customer_stations cs ON cs.customer_id = c.id
    ${whereSql}
    `,
    values,
  )

  return {
    rows,
    total: Number(count?.count || 0),
  }
}

export async function getCustomerForStationRepo(params: {
  stationId: string
  customerId: string
}) {
  return queryOne<any>(
    `
    SELECT c.*
    FROM customers c
    JOIN customer_stations cs ON cs.customer_id = c.id
    WHERE cs.station_id = $1 AND c.id = $2
    LIMIT 1
    `,
    [params.stationId, params.customerId],
  )
}

export async function setCustomerDeletedRepo(params: {
  customerId: string
  restore: boolean
}) {
  await query(
    `UPDATE customers
       SET deleted_at = ${params.restore ? 'NULL' : 'NOW()'},
           updated_at = NOW()
     WHERE id = $1`,
    [params.customerId],
  )
}

export async function updateCustomerRepo(params: {
  stationId: string
  customerId: string
  values: Record<string, any>
}) {
  const data = params.values
  await query(
    `UPDATE customers
       SET buyer_name = COALESCE($1, buyer_name),
           buyer_type = COALESCE($2, buyer_type),
           pin = COALESCE($3, pin),
           passport_number = COALESCE($4, passport_number),
           business_name = COALESCE($5, business_name),
           tin = COALESCE($6, tin),
           tax_ninbrn = COALESCE($7, tax_ninbrn),
           contact_phone = COALESCE($8, contact_phone),
           contact_mobile = COALESCE($9, contact_mobile),
           contact_fax = COALESCE($10, contact_fax),
           contact_email = COALESCE($11, contact_email),
           contact_website = COALESCE($12, contact_website),
           contact_person = COALESCE($13, contact_person),
           address_street = COALESCE($14, address_street),
           address_city = COALESCE($15, address_city),
           address_state = COALESCE($16, address_state),
           address_province = COALESCE($17, address_province),
           address_postal_code = COALESCE($18, address_postal_code),
           address_country_code = COALESCE($19, address_country_code),
           country = COALESCE($20, country),
           odometer = COALESCE($21, odometer),
           vehicle_reg_nr = COALESCE($22, vehicle_reg_nr),
           payment_type = COALESCE($23, payment_type),
           last_station_id = $24,
           last_seen_at = NOW(),
           updated_at = NOW()
     WHERE id = $25`,
    [
      data.buyerName ?? null,
      data.buyerType ?? null,
      data.pin ?? null,
      data.passportNumber ?? null,
      data.businessName ?? null,
      data.tin ?? null,
      data.taxNinbrn ?? null,
      data.contactPhone ?? null,
      data.contactMobile ?? null,
      data.contactFax ?? null,
      data.contactEmail ?? null,
      data.contactWebsite ?? null,
      data.contactPerson ?? null,
      data.addressStreet ?? null,
      data.addressCity ?? null,
      data.addressState ?? null,
      data.addressProvince ?? null,
      data.addressPostalCode ?? null,
      data.addressCountryCode ?? null,
      data.country ?? null,
      data.odometer ?? null,
      data.vehicleRegNr ?? null,
      data.paymentType ?? null,
      params.stationId,
      params.customerId,
    ],
  )
}

export async function createOrUpdateCustomerRepo(params: {
  stationId: string
  data: Record<string, any>
}) {
  const { stationId, data } = params
  return withTransaction(async (client) => {
    const existing = await txQuery<any>(
      client,
      `SELECT id FROM customers WHERE country = $1 AND tin = $2 AND deleted_at IS NULL`,
      [data.country || null, data.tin],
    )

    let customerId: string
    if (existing.rows[0]) {
      customerId = existing.rows[0].id
      await txQuery(
        client,
        `UPDATE customers
           SET buyer_name = $1,
               buyer_type = $2,
               pin = $3,
               passport_number = $4,
               business_name = $5,
               tax_ninbrn = $6,
               contact_phone = $7,
               contact_mobile = $8,
               contact_fax = $9,
               contact_email = $10,
               contact_website = $11,
               contact_person = $12,
               address_street = $13,
               address_city = $14,
               address_state = $15,
               address_province = $16,
               address_postal_code = $17,
               address_country_code = $18,
               country = $19,
               odometer = $20,
               vehicle_reg_nr = $21,
               payment_type = $22,
               last_station_id = $23,
               last_seen_at = NOW(),
               tin = $24
         WHERE id = $25`,
        [
          data.buyerName,
          data.buyerType || null,
          data.pin || null,
          data.passportNumber || null,
          data.businessName || null,
          data.taxNinbrn || null,
          data.contactPhone || null,
          data.contactMobile || null,
          data.contactFax || null,
          data.contactEmail || null,
          data.contactWebsite || null,
          data.contactPerson || null,
          data.addressStreet || null,
          data.addressCity || null,
          data.addressState || null,
          data.addressProvince || null,
          data.addressPostalCode || null,
          data.addressCountryCode || null,
          data.country || null,
          data.odometer || null,
          data.vehicleRegNr || null,
          data.paymentType || null,
          stationId,
          data.tin,
          customerId,
        ],
      )
    } else {
      const newId = uuidv4()
      const inserted = await txQuery<any>(
        client,
        `INSERT INTO customers (id,
          tin, buyer_name, buyer_type, pin, passport_number, business_name, tax_ninbrn, contact_phone, contact_mobile,
          contact_fax, contact_email, contact_website, contact_person, address_street, address_city, address_state,
          address_province, address_postal_code, address_country_code, country,
          odometer, vehicle_reg_nr, payment_type,
          station_id, last_station_id, last_seen_at,
          is_anonymous, imported_from_cloud, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24,
          $25, $26, NOW(),
          FALSE, FALSE, NOW(), NOW()
        ) RETURNING id`,
        [
          newId,
          data.tin,
          data.buyerName,
          data.buyerType || null,
          data.pin || null,
          data.passportNumber || null,
          data.businessName || null,
          data.taxNinbrn || null,
          data.contactPhone || null,
          data.contactMobile || null,
          data.contactFax || null,
          data.contactEmail || null,
          data.contactWebsite || null,
          data.contactPerson || null,
          data.addressStreet || null,
          data.addressCity || null,
          data.addressState || null,
          data.addressProvince || null,
          data.addressPostalCode || null,
          data.addressCountryCode || null,
          data.country || null,
          data.odometer || null,
          data.vehicleRegNr || null,
          data.paymentType || null,
          stationId,
          stationId,
        ],
      )
      customerId = inserted.rows[0].id
    }

    try {
      await txQuery(
        client,
        `
        INSERT INTO customer_stations (id, customer_id, station_id, first_seen_at, last_seen_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (customer_id, station_id)
        DO UPDATE SET last_seen_at = NOW()
        `,
        [uuidv4(), customerId, stationId],
      )
    } catch (error) {
      logger.error('[customers] customer stations upsert failed', { error })
      throw error
    }

    return customerId
  })
}

export async function getCustomerRowByIdRepo(customerId: string) {
  return queryOne<any>(`SELECT * FROM customers WHERE id = $1`, [customerId])
}

export async function importCloudCustomerRepo(params: {
  stationId: string
  cloudCustomerId: string
  cloud: Record<string, any>
}) {
  const { stationId, cloudCustomerId, cloud } = params
  return withTransaction(async (client) => {
    const existing = await txQuery<any>(
      client,
      `SELECT id FROM customers WHERE cloud_customer_id = $1 AND deleted_at IS NULL`,
      [cloudCustomerId],
    )

    let customerId: string

    if (existing.rows[0]) {
      customerId = existing.rows[0].id
      await txQuery(
        client,
        `
        UPDATE customers
           SET tin = $1,
               buyer_name = $2,
               buyer_type = $3,
               pin = $4,
               passport_number = $5,
               business_name = $6,
               tax_ninbrn = $7,
               contact_phone = $8,
               contact_mobile = $9,
               contact_fax = $10,
               contact_email = $11,
               contact_website = $12,
               contact_person = $13,
               address_street = $14,
               address_city = $15,
               address_state = $16,
               address_province = $17,
               address_postal_code = $18,
               address_country_code = $19,
               country = $20,
               odometer = $21,
               vehicle_reg_nr = $22,
               payment_type = $23,
               last_station_id = $24,
               last_seen_at = NOW(),
               imported_from_cloud = TRUE,
               imported_at = NOW(),
               updated_at = NOW()
         WHERE id = $25
        `,
        [
          cloud.tin,
          cloud.buyer_name,
          cloud.buyer_type,
          cloud.pin,
          cloud.passport_number,
          cloud.business_name,
          cloud.tax_ninbrn,
          cloud.contact_phone,
          cloud.contact_mobile,
          cloud.contact_fax,
          cloud.contact_email,
          cloud.contact_website,
          cloud.contact_person,
          cloud.address_street,
          cloud.address_city,
          cloud.address_state,
          cloud.address_province,
          cloud.address_postal_code,
          cloud.address_country_code,
          cloud.country,
          cloud.odometer ?? null,
          cloud.vehicle_reg_nr ?? null,
          cloud.payment_type ?? null,
          stationId,
          customerId,
        ],
      )
    } else {
      const match = await txQuery<any>(
        client,
        `SELECT id FROM customers WHERE country = $1 AND tin = $2 AND deleted_at IS NULL`,
        [cloud.country || null, cloud.tin],
      )

      if (match.rows[0]) {
        customerId = match.rows[0].id
        await txQuery(
          client,
          `
          UPDATE customers
             SET cloud_customer_id = $1,
                 tin = $2,
                 buyer_name = $3,
                 buyer_type = $4,
                 pin = $5,
                 passport_number = $6,
                 business_name = $7,
                 tax_ninbrn = $8,
                 contact_phone = $9,
                 contact_mobile = $10,
                 contact_fax = $11,
                 contact_email = $12,
                 contact_website = $13,
                 contact_person = $14,
                 address_street = $15,
                 address_city = $16,
                 address_state = $17,
                 address_province = $18,
                 address_postal_code = $19,
                 address_country_code = $20,
                 country = $21,
                 odometer = $22,
                 vehicle_reg_nr = $23,
                 payment_type = $24,
                 last_station_id = $25,
                 last_seen_at = NOW(),
                 imported_from_cloud = TRUE,
                 imported_at = NOW(),
                 updated_at = NOW()
           WHERE id = $26
          `,
          [
            cloudCustomerId,
            cloud.tin,
            cloud.buyer_name,
            cloud.buyer_type,
            cloud.pin,
            cloud.passport_number,
            cloud.business_name,
            cloud.tax_ninbrn,
            cloud.contact_phone,
            cloud.contact_mobile,
            cloud.contact_fax,
            cloud.contact_email,
            cloud.contact_website,
            cloud.contact_person,
            cloud.address_street,
            cloud.address_city,
            cloud.address_state,
            cloud.address_province,
            cloud.address_postal_code,
            cloud.address_country_code,
            cloud.country,
            cloud.odometer ?? null,
            cloud.vehicle_reg_nr ?? null,
            cloud.payment_type ?? null,
            stationId,
            customerId,
          ],
        )
      } else {
        customerId = uuidv4()
        const inserted = await txQuery<any>(
          client,
          `
          INSERT INTO customers (
            id,
            tin, buyer_name, buyer_type, pin, passport_number,
            business_name, tax_ninbrn, contact_phone, contact_mobile, contact_fax,
            contact_email, contact_website, contact_person, address_street, address_city,
            address_state, address_province, address_postal_code, address_country_code,
            country, odometer, vehicle_reg_nr, payment_type,
            station_id, last_station_id, last_seen_at,
            is_anonymous, cloud_customer_id, imported_from_cloud, imported_at,
            created_at, updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,NOW(),FALSE,$27,TRUE,NOW(),NOW(),NOW()
          )
          RETURNING id
          `,
          [
            customerId,
            cloud.tin,
            cloud.buyer_name,
            cloud.buyer_type,
            cloud.pin,
            cloud.passport_number,
            cloud.business_name,
            cloud.tax_ninbrn,
            cloud.contact_phone,
            cloud.contact_mobile,
            cloud.contact_fax,
            cloud.contact_email,
            cloud.contact_website,
            cloud.contact_person,
            cloud.address_street,
            cloud.address_city,
            cloud.address_state,
            cloud.address_province,
            cloud.address_postal_code,
            cloud.address_country_code,
            cloud.country,
            cloud.odometer ?? null,
            cloud.vehicle_reg_nr ?? null,
            cloud.payment_type ?? null,
            stationId,
            stationId,
            cloudCustomerId,
          ],
        )
        customerId = inserted.rows[0].id
      }
    }

    await txQuery(
      client,
      `
      INSERT INTO customer_stations (id, customer_id, station_id, first_seen_at, last_seen_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (customer_id, station_id)
      DO UPDATE SET last_seen_at = NOW()
      `,
      [uuidv4(), customerId, stationId],
    )

    return customerId
  })
}

export async function searchCustomersRepo(params: {
  stationId: string
  query: string
  includeCloud: boolean
  azureSearch: (query: string) => Promise<any[]>
}) {
  const local = await queryAll<any>(
    `
    SELECT c.*
    FROM customers c
    JOIN customer_stations cs ON cs.customer_id = c.id
    WHERE cs.station_id = $1
      AND c.deleted_at IS NULL
      AND (
        c.tin ILIKE '%' || $2 || '%'
        OR c.buyer_name ILIKE '%' || $2 || '%'
        OR c.business_name ILIKE '%' || $2 || '%'
        OR c.contact_person ILIKE '%' || $2 || '%'
        OR c.contact_email ILIKE '%' || $2 || '%'
        OR c.contact_phone ILIKE '%' || $2 || '%'
        OR c.contact_mobile ILIKE '%' || $2 || '%'
      )
    ORDER BY
      CASE
        WHEN c.tin ILIKE $2 || '%' THEN 0
        WHEN c.buyer_name ILIKE $2 || '%' THEN 1
        WHEN c.business_name ILIKE $2 || '%' THEN 2
        ELSE 3
      END,
      c.buyer_name ASC NULLS LAST,
      c.business_name ASC NULLS LAST
    LIMIT 50
    `,
    [params.stationId, params.query],
  )

  let cloud: any[] = []
  if (params.includeCloud && local.length === 0) {
    cloud = await params.azureSearch(params.query)
  }

  return { local, cloud }
}

export const customersRepo = {
  async findActiveIdByCountryTin(country: string, tin: string) {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM customers WHERE country = $1 AND tin = $2 AND deleted_at IS NULL LIMIT 1`,
      [country || null, tin],
    )
    return row?.id ?? null
  },

  async createNamedCustomer(params: {
    stationId: string
    country: string
    tin: string
    buyerName: string
  }) {
    return await createOrUpdateCustomerRepo({
      stationId: params.stationId,
      data: {
        country: params.country,
        tin: params.tin,
        buyerName: params.buyerName,
      },
    })
  },

  async findById(customerId: string) {
    return await getCustomerRowByIdRepo(customerId)
  },
}
