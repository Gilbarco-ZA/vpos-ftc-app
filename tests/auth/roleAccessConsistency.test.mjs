import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('tenant dashboard does not mount privileged device status', () => {
  const dashboard = read('components/dashboard/RoleDashboardHome.tsx')
  assert.match(
    dashboard,
    /role === 'manager' \|\| role === 'administrator'[\s\S]*<DeviceStatusPanel \/>/,
  )
})

test('admin pages are protected by one administrator layout boundary', () => {
  const layout = read('app/(dashboard)/admin/layout.tsx')
  assert.match(layout, /requireAuth\(\['administrator'\]\)/)
})

test('field engineer does not inherit administrator navigation', () => {
  const sidebar = read('components/layout/sidebar.tsx')
  assert.match(sidebar, /if \(role === 'field_engineer'\) \{[\s\S]*return \[dashboard\]/)
})

test('reports page and API share the same management role policy', () => {
  const page = read('app/(dashboard)/reports/page.tsx')
  const api = read('app/api/reports/route.ts')
  assert.match(page, /requireAuth\(\['manager', 'administrator'\]\)/)
  assert.doesNotMatch(api, /'tenant'/)
  assert.match(api, /roles: \['manager', 'administrator'\]/)
})

test('legacy user management APIs are administrator only', () => {
  for (const path of ['app/api/users/route.ts', 'app/api/users/[id]/route.ts']) {
    const source = read(path)
    assert.doesNotMatch(source, /requireAuth\(\['administrator', 'manager'\]\)/)
    assert.match(source, /requireAuth\(\['administrator'\]\)/)
  }
})

test('customer delete and restore are station scoped end to end', () => {
  const route = read('app/api/customers/[id]/route.ts')
  const application = read(
    'src/modules/customers/application/deleteOrRestoreCustomer.ts',
  )
  const repo = read('src/modules/customers/infrastructure/customersRepo.ts')

  assert.match(route, /stationId: user\.stationId/)
  assert.match(application, /stationId: string/)
  assert.match(repo, /cs\.station_id = \$2/)
})

test('admin user mutations verify station ownership before password or status changes', () => {
  const route = read('app/api/admin/users/route.ts')
  assert.match(route, /userExists\(userId, user\.stationId\)/)
})

test('field engineer is available through the administrator role selector', () => {
  const route = read('app/api/config/user-roles/route.ts')
  assert.match(route, /value: 'field_engineer'/)
})

test('tenant daily-operation APIs explicitly retain tenant access', () => {
  const paths = [
    'app/api/dashboard/summary/route.ts',
    'app/api/pos/catalog/route.ts',
    'app/api/transactions/route.ts',
    'app/api/receipts/route.ts',
    'app/api/customers/route.ts',
    'app/api/transactions/fuel-options/route.ts',
    'app/api/transactions/pre-fuel-customer/route.ts',
  ]

  for (const path of paths) {
    const source = read(path)
    assert.match(
      source,
      /['"]tenant['"]/,
      `Expected tenant authorization in ${path}`,
    )
  }
})
