import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = readFileSync('app/(dashboard)/transaction/fiscal-inbox/client.tsx', 'utf8')
const listRoute = readFileSync('app/api/runtime/fiscal/inbox/route.ts', 'utf8')
const bulkRoute = readFileSync('app/api/runtime/fiscal/inbox/bulk/route.ts', 'utf8')
const repo = readFileSync('src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository.ts', 'utf8')

test('fiscal inbox pagination uses limit and offset, total and selectable current-page rows', () => {
  assert.match(ui, /limit: String\(pageSize\), offset: String\(\(page - 1\) \* pageSize\)/)
  assert.match(ui, /setTotal\(Number\(payload\?\.data\?\.total/)
  assert.match(ui, /setSelectedIds\(\[\]\)/)
  assert.match(ui, /visibleIds\.every/)
  assert.match(ui, /fiscal-inbox-page-size/)
  assert.match(ui, /Previous<\/Button>/)
  assert.match(ui, /Next<\/Button>/)
})

test('all five bulk actions require selected IDs, confirmation and CSRF', () => {
  assert.match(ui, /'REQUEUE', 'Requeue'/)
  assert.match(ui, /'MARK_FAILED', 'Mark FAILED'/)
  assert.match(ui, /'MARK_DEAD', 'Mark DEAD'/)
  assert.match(ui, /'MARK_PROCESSED', 'Mark PROCESSED'/)
  assert.match(ui, /'DELETE', 'Delete'/)
  assert.match(ui, /window\.confirm/)
  assert.match(ui, /ids: selectedIds, action/)
  assert.match(ui, /'x-csrf-token': csrfToken/)
  assert.match(ui, /await refresh\(\)/)
})

test('inbox read and bulk mutations are scoped to authenticated station', () => {
  assert.match(listRoute, /const stationId = user\.stationId/)
  assert.match(bulkRoute, /const stationId = user\.stationId/)
  assert.doesNotMatch(bulkRoute, /csrf: false/)
  assert.match(bulkRoute, /roles: \['administrator'\]/)
})

test('inbox search and date filters apply before count and offset', () => {
  assert.match(repo, /filters\.search\?\.trim\(\)/)
  assert.match(repo, /countWhere\.push\(clause\)/)
  assert.match(repo, /listWhere\.push/)
  assert.match(repo, /filters\.startDate/)
  assert.match(repo, /filters\.endDate/)
})
