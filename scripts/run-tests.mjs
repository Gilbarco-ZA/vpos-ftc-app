import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { discoverTests, filterTests } from './test-suite.mjs'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)

const readOption = (name) => {
  const equals = args.find((entry) => entry.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const hasOption = (name) => args.includes(name)
const match = readOption('--match')
const listOnly = hasOption('--list')
const coverageProfileName = readOption('--coverage-profile')
const coverage = hasOption('--coverage') || Boolean(coverageProfileName)
const requirePrivate = hasOption('--require-private')

const coverageProfiles = {
  'jpl-orchestration': {
    include: [
      'src/platform/integrations/jpl/client.ts',
      'src/platform/integrations/jpl/orchestration.ts',
      'src/platform/integrations/jpl/specialRecordPersistence.ts',
      'src/platform/integrations/jpl/commands/controllerRecords.ts',
      'src/modules/forecourt/infrastructure/jpl/specialRecords.ts',
    ],
    tests: [
      'tests/forecourt/jpl-orchestration.test.ts',
      'tests/forecourt/jpl-special-record-persistence.test.ts',
      'tests/forecourt/jpl-client-lifecycle.test.ts',
      'tests/forecourt/jpl-command-handlers.test.ts',
      'tests/forecourt/domsSpecialRecords.test.ts',
      'tests/runtime/jplClientArchitecture.test.ts',
    ],
    thresholds: { lines: 90, branches: 80, functions: 95 },
  },
  'jpl-status-reads': {
    include: [
      'src/platform/integrations/jpl/protocol/statusReads.ts',
    ],
    tests: [
      'tests/forecourt/jpl-status-reads.test.ts',
      'tests/runtime/jplProtocolRuntime.test.ts',
      'tests/runtime/jplProtocolSnapshots.test.ts',
    ],
    thresholds: { lines: 95, branches: 88, functions: 95 },
  },
  'operational-services': {
    include: [
      'src/modules/transactions/infrastructure/fiscalization/receiptGenerator.ts',
      'src/shared/receipts/mapFiscalReceipt.ts',
      'src/modules/fiscal-inbox/application/services/fiscal-inbox-status-service.ts',
      'src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.mapper.ts',
      'src/modules/forecourt/infrastructure/jpl/dynamicTankData.ts',
      'src/modules/forecourt/domain/tankGaugeDiagnostics.ts',
    ],
    tests: [
      'tests/receipts/receipt-behavior.test.ts',
      'tests/fiscal-inbox/fiscal-inbox-behavior.test.ts',
      'tests/forecourt/doms-dynamic-tank-edge-cases.test.ts',
      'tests/forecourt/domsDynamicTankData.test.ts',
      'tests/forecourt/domsEventAndTankRetention.test.ts',
      'tests/runtime/receiptCanonicalStorage.test.ts',
    ],
    thresholds: { lines: 90, branches: 65, functions: 85 },
  },
  'jpl-pricing': {
    include: [
      'src/platform/integrations/jpl/commands/pricing.ts',
      'src/platform/integrations/jpl/commands/pricing/*.ts',
    ],
    tests: [
      'tests/forecourt/jpl-pricing-modules.test.ts',
      'tests/forecourt/jpl-remaining-command-handlers.test.ts',
    ],
    thresholds: { lines: 90, branches: 80, functions: 90 },
  },
  'jpl-remaining-commands': {
    include: [
      'src/platform/integrations/jpl/commands/pricing.ts',
      'src/platform/integrations/jpl/commands/pricing/*.ts',
      'src/platform/integrations/jpl/commands/dynamicTank.ts',
      'src/platform/integrations/jpl/commands/delivery.ts',
      'src/platform/integrations/jpl/protocol/runtime.ts',
      'src/platform/integrations/jpl/protocol/snapshots.ts',
    ],
    tests: [
      'tests/forecourt/jpl-pricing-modules.test.ts',
      'tests/forecourt/jpl-remaining-command-handlers.test.ts',
      'tests/runtime/jplProtocolRuntime.test.ts',
      'tests/runtime/jplProtocolSnapshots.test.ts',
    ],
    thresholds: { lines: 85, branches: 65, functions: 90 },
  },
  'jpl-client': {
    include: [
      'src/platform/integrations/jpl/client.ts',
      'src/platform/integrations/jpl/orchestration.ts',
      'src/platform/integrations/jpl/specialRecordPersistence.ts',
      'src/platform/integrations/jpl/commands/*.ts',
      'src/platform/integrations/jpl/commands/pricing/*.ts',
      'src/platform/integrations/jpl/protocol/*.ts',
    ],
    tests: [
      'tests/forecourt/jpl-client-lifecycle.test.ts',
      'tests/forecourt/jpl-orchestration.test.ts',
      'tests/forecourt/jpl-special-record-persistence.test.ts',
      'tests/forecourt/jpl-status-reads.test.ts',
      'tests/forecourt/jpl-command-handlers.test.ts',
      'tests/forecourt/jpl-pricing-modules.test.ts',
      'tests/forecourt/jpl-remaining-command-handlers.test.ts',
      'tests/runtime/jplProtocolRuntime.test.ts',
      'tests/runtime/jplProtocolSnapshots.test.ts',
    ],
    thresholds: { lines: 93, branches: 87, functions: 95 },
  },
}

const coverageProfile = coverageProfileName
  ? coverageProfiles[coverageProfileName]
  : undefined

if (coverageProfileName && !coverageProfile) {
  console.error(
    `Unknown coverage profile: ${coverageProfileName}. Available profiles: ${Object.keys(coverageProfiles).join(', ')}`,
  )
  process.exit(1)
}

const privatePackages = [
  '@gilbarcoafs/doms-pos-jpl',
  '@gilbarcoafs/vpos-common',
]

const missingPrivatePackages = privatePackages.filter((packageName) => {
  try {
    require.resolve(packageName)
    return false
  } catch {
    return true
  }
})

if (requirePrivate && missingPrivatePackages.length > 0) {
  console.error(
    `Private test dependencies are required but unavailable: ${missingPrivatePackages.join(', ')}`,
  )
  console.error(
    'Authenticate against the Gilbarco Azure npm registry, install dependencies, and rerun the command.',
  )
  process.exit(2)
}

const discoveredTests = await discoverTests('tests')
const tests = coverageProfile?.tests
  ? coverageProfile.tests
  : filterTests(discoveredTests, match)

if (tests.length === 0) {
  console.error(match ? `No tests matched: ${match}` : 'No test files found.')
  process.exit(1)
}

if (listOnly) {
  console.log(tests.join('\n'))
  process.exit(0)
}

const concurrency = Math.max(
  1,
  Number.parseInt(process.env.VPOS_TEST_CONCURRENCY || '4', 10) || 4,
)
const timeoutMs = Math.max(
  1000,
  Number.parseInt(process.env.VPOS_TEST_TIMEOUT_MS || '30000', 10) || 30000,
)

const nodeArgs = []
if (missingPrivatePackages.length > 0) {
  nodeArgs.push(
    '--require',
    resolve('tests/support/register-private-package-stubs.cjs'),
  )
}
nodeArgs.push('--import', 'tsx')
if (coverage) {
  nodeArgs.push('--experimental-test-coverage')
  const includes = coverageProfile?.include ?? ['src/**/*.ts', 'src/**/*.tsx']
  for (const include of includes) {
    nodeArgs.push(`--test-coverage-include=${include}`)
  }
  nodeArgs.push('--test-coverage-exclude=**/*.d.ts')

  if (coverageProfile) {
    nodeArgs.push(
      `--test-coverage-lines=${coverageProfile.thresholds.lines}`,
      `--test-coverage-branches=${coverageProfile.thresholds.branches}`,
      `--test-coverage-functions=${coverageProfile.thresholds.functions}`,
    )
  }
}
nodeArgs.push(
  '--test',
  `--test-concurrency=${concurrency}`,
  `--test-timeout=${timeoutMs}`,
  ...tests,
)

const mode =
  missingPrivatePackages.length === 0
    ? 'real'
    : missingPrivatePackages.length === privatePackages.length
      ? 'fallback-stubs'
      : 'mixed'
console.log(
  `Running ${tests.length} test files with private package mode: ${mode}.`,
)
if (missingPrivatePackages.length > 0) {
  console.log(
    `Fallback imports enabled for: ${missingPrivatePackages.join(', ')}. Runtime operations remain fail-fast.`,
  )
}

const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    VPOS_TEST_PRIVATE_PACKAGES: mode,
    VPOS_TEST_STUB_PACKAGES: missingPrivatePackages.join(','),
    VPOS_TEST_MISSING_PRIVATE_PACKAGES: missingPrivatePackages.join(','),
  },
})

process.exit(result.status ?? 1)
