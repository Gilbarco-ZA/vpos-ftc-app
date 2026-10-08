import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { createCompatibilityApi } from './partner-api-compat.mjs'

const host = process.env.VPOS_PARTNER_SANDBOX_HOST || '127.0.0.1'
const port = Number(process.env.VPOS_PARTNER_SANDBOX_PORT || 3080)
const token = process.env.VPOS_PARTNER_SANDBOX_TOKEN || 'sandbox-token'

const stationId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const now = () => new Date().toISOString()

const customers = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    tin: 'TIN100001',
    buyerName: 'Sandbox Transport Ltd',
    buyerType: 'BUSINESS',
    pin: null,
    businessName: 'Sandbox Transport Ltd',
    contactEmail: 'integration@example.test',
    contactPhone: '+255700000001',
    addressCity: 'Dar es Salaam',
    addressCountryCode: 'TZ',
    country: 'TZ',
    odometer: null,
    vehicleRegNr: 'T 100 SAN',
    paymentType: 'CARD',
    lastStationId: stationId,
    lastSeenAt: now(),
  },
]

const transactions = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    customerId: customers[0].id,
    pumpNumber: 1,
    transactionDateTime: now(),
    totalAmount: 65000,
    volume: 23.423,
    fuelType: 'PMS',
    posReference: 'SANDBOX-001',
    status: 'FISCALIZED',
    receiptNumber: '1',
    buyerName: customers[0].buyerName,
    tin: customers[0].tin,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    customerId: null,
    pumpNumber: 2,
    transactionDateTime: now(),
    totalAmount: 42000,
    volume: 15.135,
    fuelType: 'AGO',
    posReference: 'SANDBOX-002',
    status: 'OPEN',
    receiptNumber: null,
    buyerName: null,
    tin: null,
  },
]

const fuelOptions = [
  {
    pumpId: '30000000-0000-4000-8000-000000000001',
    pumpNumber: 1,
    nozzleId: '31000000-0000-4000-8000-000000000001',
    nozzleNumber: 1,
    displayNumber: 1,
    tankId: '32000000-0000-4000-8000-000000000001',
    tankName: 'Tank 1',
    productRowId: '33000000-0000-4000-8000-000000000001',
    gradeId: 'PMS',
    gradeName: 'Premium Motor Spirit',
    productCode: 'PMS',
  },
  {
    pumpId: '30000000-0000-4000-8000-000000000002',
    pumpNumber: 2,
    nozzleId: '31000000-0000-4000-8000-000000000002',
    nozzleNumber: 1,
    displayNumber: 1,
    tankId: '32000000-0000-4000-8000-000000000002',
    tankName: 'Tank 2',
    productRowId: '33000000-0000-4000-8000-000000000002',
    gradeId: 'AGO',
    gradeName: 'Automotive Gas Oil',
    productCode: 'AGO',
  },
]

const allocations = []
const compatibility = createCompatibilityApi({ customers, transactions, fuelOptions, allocations, stationId, userId })

const send = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body, null, 2))
}

const ok = (data) => ({ ok: true, success: true, data })
const fail = (message, code = 'BAD_REQUEST') => ({
  ok: false,
  success: false,
  error: { code, message },
})

const readBody = async (req) => {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 1024 * 1024) throw new Error('Request body too large')
  }
  if (!text) return {}
  return JSON.parse(text)
}

const authOk = (req) =>
  String(req.headers.authorization || '') === `Bearer ${token}`

const normaliseCustomer = (body) => ({
  id: randomUUID(),
  tin: String(body.tin || '').trim().toUpperCase(),
  buyerName: String(body.buyerName || '').trim(),
  buyerType: body.buyerType ?? null,
  pin: body.pin ?? null,
  businessName: body.businessName ?? null,
  contactEmail: body.contactEmail ?? null,
  contactPhone: body.contactPhone ?? null,
  addressCity: body.addressCity ?? null,
  addressCountryCode: body.addressCountryCode
    ? String(body.addressCountryCode).toUpperCase()
    : null,
  country: body.country ? String(body.country).toUpperCase() : null,
  odometer: body.odometer ?? null,
  vehicleRegNr: body.vehicleRegNr ?? null,
  paymentType: body.paymentType ?? null,
  lastStationId: stationId,
  lastSeenAt: now(),
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || host}`)
  const path = url.pathname

  if (req.method === 'GET' && path === '/v1/health') {
    return send(res, 200, {
      ok: true,
      service: 'vpos-ftc-partner-api',
      version: '1.0.0',
      sandbox: true,
    })
  }

  const publicPaths = new Set(['/api/livez','/api/readyz','/api/healthz','/api/metrics','/api/security/csrf','/api/auth/login'])
  if (!publicPaths.has(path) && !authOk(req) && req.headers.cookie?.includes('vpos-sandbox-session=1') !== true) {
    return send(res, 401, fail('Invalid sandbox credentials', 'UNAUTHORIZED'))
  }
  if (path.startsWith('/api/')) {
    try { if (await compatibility.run(req,res,url)) return }
    catch (error) { return send(res,400,fail(String(error?.message||error))) }
  }
  if (!path.startsWith('/v1/')) return send(res, 404, fail('Not found', 'NOT_FOUND'))

  try {
    if (req.method === 'GET' && path === '/v1/customers') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase()
      const page = Math.max(1, Number(url.searchParams.get('page') || 1))
      const pageSize = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get('pageSize') || 20)),
      )
      const filtered = q
        ? customers.filter((x) =>
            [x.tin, x.buyerName, x.vehicleRegNr]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
          )
        : customers
      const start = (page - 1) * pageSize
      return send(res, 200, ok({
        rows: filtered.slice(start, start + pageSize),
        page,
        pageSize,
        total: filtered.length,
      }))
    }

    if (req.method === 'POST' && path === '/v1/customers') {
      const body = await readBody(req)
      if (!String(body.tin || '').trim() || !String(body.buyerName || '').trim()) {
        return send(res, 400, fail('tin and buyerName are required'))
      }
      const tin = String(body.tin).trim().toUpperCase()
      const existing = customers.find((x) => x.tin === tin)
      if (existing) {
        Object.assign(existing, normaliseCustomer({ ...existing, ...body }), {
          id: existing.id,
        })
        return send(res, 200, ok(existing))
      }
      const customer = normaliseCustomer(body)
      customers.push(customer)
      return send(res, 200, ok(customer))
    }

    const customerMatch = path.match(/^\/v1\/customers\/([^/]+)$/)
    if (req.method === 'GET' && customerMatch) {
      const customer = customers.find((x) => x.id === customerMatch[1])
      return customer
        ? send(res, 200, ok(customer))
        : send(res, 404, fail('Customer not found', 'NOT_FOUND'))
    }

    if (req.method === 'GET' && path === '/v1/transactions') {
      const status = String(url.searchParams.get('status') || '').trim().toUpperCase()
      const search = String(url.searchParams.get('search') || '').trim().toLowerCase()
      const page = Math.max(1, Number(url.searchParams.get('page') || 1))
      const pageSize = Math.min(
        200,
        Math.max(1, Number(url.searchParams.get('pageSize') || 50)),
      )
      let filtered = transactions
      if (status) filtered = filtered.filter((x) => x.status === status)
      if (search) {
        filtered = filtered.filter((x) =>
          [x.id, x.posReference, x.buyerName, x.tin, x.fuelType]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search)),
        )
      }
      const start = (page - 1) * pageSize
      return send(res, 200, ok({
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      }))
    }

    const txMatch = path.match(/^\/v1\/transactions\/([^/]+)$/)
    if (req.method === 'GET' && txMatch) {
      const transaction = transactions.find((x) => x.id === txMatch[1])
      return transaction
        ? send(res, 200, ok(transaction))
        : send(res, 404, fail('Transaction not found', 'NOT_FOUND'))
    }

    if (req.method === 'GET' && path === '/v1/transactions/fuel-options') {
      return send(res, 200, ok({ options: fuelOptions }))
    }

    if (path === '/v1/transactions/pre-fuel-customer' && req.method === 'GET') {
      return send(res, 200, ok({
        captureOrder: 'before_transaction',
        allocations: allocations.filter((x) => x.status === 'PENDING'),
      }))
    }

    if (path === '/v1/transactions/pre-fuel-customer' && req.method === 'POST') {
      const body = await readBody(req)
      if (body.action === 'cancel') {
        const allocation = allocations.find(
          (x) => x.id === String(body.allocationId || '') && x.status === 'PENDING',
        )
        if (!allocation) {
          return send(res, 404, fail('Pending pre-fuel allocation not found', 'NOT_FOUND'))
        }
        allocation.status = 'CANCELLED'
        allocation.cancelledAt = now()
        allocation.updatedAt = allocation.cancelledAt
        return send(res, 200, ok(allocation))
      }

      const pumpNumber = Number(body.pumpNumber)
      const nozzleNumber = Number(body.nozzleNumber)
      const customer = customers.find((x) => x.id === String(body.customerId || ''))
      const option = fuelOptions.find(
        (x) => x.pumpNumber === pumpNumber && x.nozzleNumber === nozzleNumber,
      )
      if (!Number.isInteger(pumpNumber) || pumpNumber <= 0 ||
          !Number.isInteger(nozzleNumber) || nozzleNumber <= 0 ||
          !customer || !option) {
        return send(res, 400, fail('Valid pumpNumber, nozzleNumber and customerId are required'))
      }

      const existing = allocations.find(
        (x) =>
          x.status === 'PENDING' &&
          x.pumpNumber === pumpNumber &&
          x.nozzleNumber === nozzleNumber,
      )
      const timestamp = now()
      const allocation = existing || {
        id: randomUUID(),
        stationId,
        pumpNumber,
        nozzleId: option.nozzleId,
        nozzleNumber,
        displayNumber: option.displayNumber,
        customerId: customer.id,
        allocatedBy: userId,
        status: 'PENDING',
        transactionId: null,
        consumedAt: null,
        cancelledAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        buyerName: customer.buyerName,
        tin: customer.tin,
      }
      if (existing) {
        Object.assign(existing, {
          customerId: customer.id,
          allocatedBy: userId,
          createdAt: timestamp,
          updatedAt: timestamp,
          buyerName: customer.buyerName,
          tin: customer.tin,
        })
      } else {
        allocations.push(allocation)
      }
      return send(res, 200, ok(allocation))
    }

    return send(res, 404, fail('Not found', 'NOT_FOUND'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return send(res, 400, fail(message))
  }
})

server.listen(port, host, () => {
  process.stdout.write(
    `VPOS partner sandbox listening on http://${host}:${port}/v1\n`,
  )
})
