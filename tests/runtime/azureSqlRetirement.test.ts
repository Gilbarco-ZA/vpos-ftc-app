import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('vpos-ftc-app has no active MSSQL client or dependency', () => {
  const packageJson = JSON.parse(read('package.json'))
  const envDefaults = read('src/platform/runtime/env-defaults.cjs')

  assert.equal(packageJson.dependencies?.mssql, undefined)
  assert.equal(packageJson.devDependencies?.['@types/mssql'], undefined)
  assert.equal(packageJson.overrides?.tedious, undefined)
  assert.equal(packageJson.overrides?.['@azure/identity'], undefined)
  assert.doesNotMatch(envDefaults, /AZURE_SQL_/)
  assert.equal(existsSync('src/platform/db/azure-sql.ts'), false)
  assert.equal(existsSync('src/shared/db/azureSql.ts'), false)
  assert.equal(existsSync('src/modules/sync'), false)
  assert.equal(existsSync('scripts/migrations/azure-sql'), false)
})

test('retired station sync routes direct operators to vpos-proxy ownership', () => {
  const adminRun = read('app/api/admin/sync/run/route.ts')
  const userRun = read('app/api/sync/run/route.ts')
  const status = read('app/api/admin/sync/status/route.ts')
  const maintenance = read(
    'app/(dashboard)/admin/maintenance/MaintenanceClient.tsx',
  )

  for (const source of [adminRun, userRun, status]) {
    assert.match(source, /vpos-proxy/)
  }
  assert.match(adminRun, /410/)
  assert.match(userRun, /410/)
  assert.doesNotMatch(maintenance, /SyncNowButton/)
  assert.doesNotMatch(maintenance, /Station data reconciliation/)
})

test('customer search remains local and preserves the legacy response shape', () => {
  const application = read(
    'src/modules/customers/application/searchCustomers.ts',
  )
  const repository = read(
    'src/modules/customers/infrastructure/customersRepo.ts',
  )
  const importRoute = read('app/api/customers/import/route.ts')

  assert.doesNotMatch(application, /azure|cloud/i)
  assert.doesNotMatch(repository, /azureSearch|importCloudCustomerRepo/)
  assert.match(repository, /return \{ local, cloud: \[\] \}/)
  assert.match(importRoute, /410/)
})
