import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

const layout = read('app/(dashboard)/layout.tsx')
const sidebar = read('components/layout/sidebar.tsx')
const forecourtPage = read('app/(dashboard)/admin/forecourt/page.tsx')
const forecourtClient = read('app/(dashboard)/admin/forecourt/client.tsx')
const fieldValidation = read(
  'components/admin/forecourt/JplFieldValidationPanel.tsx',
)
const disclosure = read(
  'components/admin/forecourt/CollapsibleStatusSection.tsx',
)

const panelSources = [
  read('components/admin/forecourt/JplCommissioningReadinessPanel.tsx'),
  read('components/admin/forecourt/JplOperationalReadinessPanel.tsx'),
  fieldValidation,
  read('components/admin/forecourt/JplReconciliationPanel.tsx'),
  read('components/admin/forecourt/JplWorkflowReviewPanel.tsx'),
  read('components/admin/forecourt/JplMaintenancePlanPanel.tsx'),
  read('components/admin/forecourt/JplMaintenanceGatePanel.tsx'),
  read('components/admin/forecourt/JplMaintenancePreviewPanel.tsx'),
  read('components/admin/forecourt/JplMaintenanceExecutionGatePanel.tsx'),
  read('components/admin/forecourt/JplDiagnosticsPanel.tsx'),
  forecourtClient,
].join('\n')

test('Tanzania fiscal navigation is gated by the authenticated station country', () => {
  assert.match(layout, /stationCountry=\{user\.station\.country\}/)
  assert.match(sidebar, /isTanzaniaCountry\(stationCountry\)/)
  assert.match(sidebar, /href: '\/admin\/tanzania-fiscal'/)
})

test('forecourt country-specific readiness content receives the server country decision', () => {
  assert.match(
    forecourtPage,
    /isTanzania=\{isTanzaniaCountry\(user\.station\?\.country\)\}/,
  )
  assert.match(
    fieldValidation,
    /isTanzania \|\| area !== 'tanzania-fiscalization'/,
  )
})

test('forecourt review sections use collapsed title-and-status disclosures', () => {
  assert.match(disclosure, /<details/)
  assert.match(disclosure, /<summary/)
  assert.match(disclosure, /<Badge variant=\{statusVariant\}>\{status\}<\/Badge>/)

  for (const title of [
    'Forecourt connection',
    'DOMS commissioning readiness',
    'DOMS field validation readiness',
    'Release gate',
    'Import external field evidence JSON',
    'Live connection setting checks',
    'First-site commissioning checklist',
    'Legacy/simulator to JPL-only runbook',
    'DOMS operational readiness',
    'DOMS configuration reconciliation',
    'FTC-side remediation suggestions',
    'Bulk FTC-side mapping review/apply',
    'FTC mapping change history',
    'Production workflow review',
    'Transaction-buffer recovery',
    'DOMS special records',
    'Dynamic tank data audit',
    'Optional DOMS module runtime',
    'Pending replay clears',
    'DOMS maintenance plan',
    'Dry-run plan steps',
    'Possible PSS maintenance candidates',
    'Record maintenance plan review',
    'DOMS maintenance approval gate',
    'Request maintenance session',
    'Approve or cancel current session',
    'DOMS maintenance command previews',
    'DOMS maintenance execution gate',
    'JPL diagnostics',
    'Audit log (Postgres: forecourt_events)',
  ]) {
    assert.equal(
      panelSources.includes(`title="${title}"`),
      true,
      `Missing collapsible section: ${title}`,
    )
  }
})


test('wide field-validation sections and maintenance session controls use dedicated rows', () => {
  assert.match(fieldValidation, /const FULL_WIDTH_AREAS = new Set\(\[/)
  for (const area of ['jpl-hardware', 'maintenance-safety', 'cloud-cutover']) {
    assert.equal(
      fieldValidation.includes(`'${area}'`),
      true,
      `Missing full-width validation area: ${area}`,
    )
  }

  const maintenanceGate = read(
    'components/admin/forecourt/JplMaintenanceGatePanel.tsx',
  )
  assert.match(maintenanceGate, /<div className="grid grid-cols-1 gap-4">/)
  assert.doesNotMatch(
    maintenanceGate,
    /<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">/,
  )
})
