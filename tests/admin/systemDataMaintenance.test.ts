import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('backup endpoints are administrator-only and provide database and full backups', () => {
  const route = read('app/api/admin/system/backups/route.ts')
  const downloadRoute = read(
    'app/api/admin/system/backups/[filename]/route.ts',
  )
  const implementation = read(
    'src/platform/maintenance/system-backups.ts',
  )

  assert.match(route, /roles: \['administrator'\]/)
  assert.match(downloadRoute, /roles: \['administrator'\]/)
  assert.match(downloadRoute, /turbopackIgnore: true/)
  assert.match(route, /createDatabaseBackup/)
  assert.match(route, /createFullBackup/)
  assert.match(implementation, /pg_dump/)
  assert.match(implementation, /getPrimaryDataRoot\(\)/)
  assert.match(implementation, /archiver\('zip'/)
})

test('database reset requires explicit confirmation, backup, local DB guard, drop and restart', () => {
  const route = read('app/api/admin/system/reset-database/route.ts')
  const implementation = read(
    'src/platform/maintenance/system-backups.ts',
  )

  assert.match(route, /roles: \['administrator'\]/)
  assert.match(route, /DROP VPOS DATABASE/)
  assert.ok(
    route.indexOf('createDatabaseBackup({ preReset: true })') <
      route.indexOf('dropApplicationDatabase()'),
  )
  assert.ok(
    route.indexOf('dropApplicationDatabase()') <
      route.lastIndexOf('scheduleApplicationRestart'),
  )
  assert.match(implementation, /Remote database reset is disabled/)
  assert.match(implementation, /DROP DATABASE IF EXISTS/)
  assert.match(implementation, /pg_terminate_backend/)
})

test('admin maintenance routes do not trace the application project root', () => {
  const backupImplementation = read(
    'src/platform/maintenance/system-backups.ts',
  )
  const restartImplementation = read(
    'src/platform/maintenance/service-restart.ts',
  )

  assert.doesNotMatch(backupImplementation, /process\.cwd\(\)/)
  assert.doesNotMatch(restartImplementation, /process\.cwd\(\)/)
  assert.doesNotMatch(restartImplementation, /path\.resolve\(/)
  assert.doesNotMatch(backupImplementation, /next\.config\.mjs/)
  assert.doesNotMatch(backupImplementation, /getApplicationBackupFiles/)
  assert.match(restartImplementation, /VPOS_APPLICATION_ROOT/)
  assert.match(restartImplementation, /turbopackIgnore: true/)
})

