import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as ts from 'typescript'

const missingPackages = new Set(
  String(process.env.VPOS_TEST_MISSING_PRIVATE_PACKAGES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const skipReasonFor = (packageName: string) =>
  missingPackages.has(packageName)
    ? `${packageName} is unavailable; run npm run test:vendor in an authenticated environment.`
    : false

const runVendorContractProbe = (
  packageName: string,
  assertions: string,
) => {
  const probeDir = mkdtempSync(join(tmpdir(), 'vpos-vendor-contract-'))
  const resultPath = join(probeDir, 'result.json')
  const script = `
import { writeFileSync } from 'node:fs'

try {
  const vendor = await import(${JSON.stringify(packageName)})
  ${assertions}
  writeFileSync(process.env.VPOS_VENDOR_CONTRACT_RESULT, JSON.stringify({ ok: true }))
  process.exit(0)
} catch (error) {
  writeFileSync(
    process.env.VPOS_VENDOR_CONTRACT_RESULT,
    JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }),
  )
  process.exit(1)
}
`

  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', script],
      {
        timeout: 10_000,
        stdio: 'ignore',
        env: {
          ...process.env,
          VPOS_VENDOR_CONTRACT_PROBE: '1',
          VPOS_VENDOR_CONTRACT_RESULT: resultPath,
        },
      },
    )

    const spawnError = result.error as NodeJS.ErrnoException | undefined

    assert.equal(
      spawnError?.code,
      undefined,
      spawnError?.code === 'ETIMEDOUT'
        ? `${packageName} contract probe timed out after 10 seconds`
        : `${packageName} contract probe failed to start: ${spawnError?.message ?? 'unknown error'}`,
    )

    let probeDiagnostic = ''
    try {
      const payload = JSON.parse(readFileSync(resultPath, 'utf8')) as {
        ok?: boolean
        message?: string
        stack?: string | null
      }
      if (payload.ok === false) {
        probeDiagnostic = payload.stack || payload.message || ''
      }
    } catch {
      // The exit status below still reports failures when the probe could not
      // persist diagnostics.
    }

    assert.equal(
      result.status,
      0,
      [
        `${packageName} contract probe exited with status ${String(result.status)}`,
        probeDiagnostic,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  } finally {
    rmSync(probeDir, { recursive: true, force: true })
  }
}

const assertDeclaredNamedExports = (
  packageName: string,
  exportNames: string[],
) => {
  const repoRequire = createRequire(join(process.cwd(), 'package.json'))

  assert.doesNotThrow(
    () => repoRequire.resolve(packageName),
    `${packageName} runtime entry could not be resolved from the installed private package`,
  )

  // vpos-common performs process-control/bootstrap work while its package root
  // is evaluated. Executing that root in a contract-test subprocess can block
  // indefinitely even though the application consumes the named exports
  // successfully. Verify the installed package's TypeScript contract without
  // executing package initialization. Use a real temporary source file beneath
  // the repository root so TypeScript's normal NodeNext resolution can find the
  // authenticated node_modules tree consistently on Windows and POSIX.
  const contractDir = mkdtempSync(
    join(process.cwd(), '.vpos-private-package-contract-'),
  )
  const contractFileName = join(contractDir, 'contract.ts')
  const sourceText = `${exportNames
    .map((name) => `import { ${name} } from ${JSON.stringify(packageName)}`)
    .join('\n')}\n${exportNames.map((name) => `void ${name}`).join('\n')}\n`
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
  }

  try {
    writeFileSync(contractFileName, sourceText, 'utf8')

    const program = ts.createProgram([contractFileName], compilerOptions)
    const contractSourceFile = program.getSourceFile(contractFileName)
    assert.ok(
      contractSourceFile,
      'Temporary vendor contract source was not loaded',
    )
    const diagnostics = ts.getPreEmitDiagnostics(program, contractSourceFile)

    assert.equal(
      diagnostics.length,
      0,
      diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        .join('\n'),
    )
  } finally {
    rmSync(contractDir, { recursive: true, force: true })
  }
}

test(
  '@gilbarcoafs/doms-pos-jpl exposes the required runtime contract',
  { skip: skipReasonFor('@gilbarcoafs/doms-pos-jpl') },
  () => {
    runVendorContractProbe(
      '@gilbarcoafs/doms-pos-jpl',
      `
if (typeof vendor.buildFcLogonEnvelope !== 'function') {
  throw new Error('Expected buildFcLogonEnvelope to be a function')
}
if (
  typeof vendor.JplClient !== 'function' &&
  typeof vendor.createForecourt !== 'function'
) {
  throw new Error('Expected JplClient or createForecourt')
}
`,
    )
  },
)

test(
  '@gilbarcoafs/vpos-common declares process-control constants',
  { skip: skipReasonFor('@gilbarcoafs/vpos-common') },
  () => {
    assertDeclaredNamedExports('@gilbarcoafs/vpos-common', [
      'OSServices',
      'SERVICE_COMMANDS',
    ])
  },
)
