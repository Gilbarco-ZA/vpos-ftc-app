import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('pump fuel lines are locked while non-fuel transaction items remain editable', () => {
  const editor = read(
    'components/transactions/TransactionLinesEditorSheet.tsx',
  )
  const productEditor = read(
    'components/transactions/TransactionProductEditor.tsx',
  )
  const rolePage = read(
    'components/transactions/NonFiscalizedTransactionsRolePage.tsx',
  )
  const route = read('app/api/transactions/[id]/lines/route.ts')
  const repository = read(
    'src/modules/transactions/infrastructure/persistence/transaction-write.repository.ts',
  )

  assert.match(editor, /fuelItemsLocked/)
  assert.match(editor, /lockedProductIds/)
  assert.match(editor, /Pump fuel item locked/)
  assert.match(productEditor, /excludeFuelProductsFromCatalog/)
  assert.match(productEditor, /lockedProductIdSet\.has\(line\.productId\)/)
  assert.match(rolePage, /categoryName: product\.categoryName/)
  assert.match(route, /lockedProductIds/)
  assert.match(route, /excludeFuelProductsFromCatalog/)
  assert.match(repository, /PUMP_RECORDED_FUEL_ITEM_IMMUTABLE/)
  assert.match(repository, /PUMP_RECORDED_FUEL_ADDITION_BLOCKED/)
})

test('pending transactions can enter fiscalization after customer linking', () => {
  const adminTable = read(
    'components/transactions/NonFiscalizedTransactionsPageClient.tsx',
  )
  const managerTable = read(
    'components/transactions/ManagerNonFiscalizedTable.tsx',
  )
  const sendNowRoute = read('app/api/transactions/send-now/route.ts')
  const fiscalizeRoute = read('app/api/transactions/[id]/fiscalize/route.ts')
  const retryRoute = read('app/api/transactions/[id]/retry/route.ts')

  assert.match(adminTable, /'FAILED', 'PENDING'/)
  assert.match(managerTable, /'PENDING'/)
  assert.match(adminTable, /Link customer & fiscalize/)
  assert.match(adminTable, /Send linked transaction now/)
  assert.match(sendNowRoute, /CUSTOMER_LINK_REQUIRED/)
  assert.match(fiscalizeRoute, /CUSTOMER_LINK_REQUIRED/)
  assert.match(retryRoute, /CUSTOMER_LINK_REQUIRED/)
})

test('linking a customer persists vehicle details to the transaction and customer', () => {
  const fiscalizeRoute = read('app/api/transactions/[id]/fiscalize/route.ts')
  const fiscalizeSheet = read(
    'components/transactions/non-fiscalized/NonFiscalizedFiscalizeSheet.tsx',
  )
  const allocation = read(
    'src/modules/transactions/infrastructure/persistence/transaction-status.repository.ts',
  )

  assert.match(fiscalizeRoute, /vehicleDetails/)
  assert.match(fiscalizeRoute, /vehicleRegNr/)
  assert.match(fiscalizeSheet, /transaction\.odometer/)
  assert.match(fiscalizeSheet, /transaction\.vehicleRegNr/)
  assert.match(allocation, /UPDATE transactions/)
  assert.match(allocation, /INSERT INTO customer_stations/)
  assert.match(allocation, /ON CONFLICT \(customer_id, station_id\) DO UPDATE/)
  assert.match(allocation, /UPDATE customers c/)
  assert.match(allocation, /vehicle_reg_nr = COALESCE/)
  assert.match(allocation, /odometer = COALESCE/)
})

test('selected product category renders its icon and category name', () => {
  const categoryIcons = read('components/products/category-icons.tsx')
  const productEditor = read(
    'components/products/ProductsUpsertSheetContent.tsx',
  )

  assert.match(categoryIcons, /<span className="truncate">\{label\}<\/span>/)
  assert.match(productEditor, /<CategoryIconChip/)
  assert.match(productEditor, /label=\{selectedOption\.label\}/)
})
