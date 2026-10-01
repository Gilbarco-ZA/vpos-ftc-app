import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

interface PackageConfig {
  main?: string
  nodeVersionDir?: string
  dependencies?: string
  autoStartAfterInstall?: boolean
  autoStartOnBoot?: boolean
  systemdServiceName?: string
  installUser?: string
  installOwner?: string
  startScriptTemplate?: string
  healthPorts?: string
  healthPaths?: string
}

const moduleRequire = createRequire(import.meta.url)
const configPath = path.resolve(process.cwd(), '.config/config.js')
const pipelinePath = path.resolve(process.cwd(), 'azure-pipelines.yml')
const packagePath = path.resolve(process.cwd(), 'package.json')
const originalNodeVersionDir = process.env.FNEZ_NODE_VERSION_DIR

function loadConfig(nodeVersionDir: string): PackageConfig {
  process.env.FNEZ_NODE_VERSION_DIR = nodeVersionDir
  delete moduleRequire.cache[moduleRequire.resolve(configPath)]
  return moduleRequire(configPath).config as PackageConfig
}

function restoreEnvironment(): void {
  if (originalNodeVersionDir === undefined) {
    delete process.env.FNEZ_NODE_VERSION_DIR
  } else {
    process.env.FNEZ_NODE_VERSION_DIR = originalNodeVersionDir
  }

  delete moduleRequire.cache[moduleRequire.resolve(configPath)]
}

test.afterEach(restoreEnvironment)
test.after(restoreEnvironment)

test('uses the selected Node 22 runtime for both supported controllers', () => {
  const cases = [
    ['CPB539', 'node-v22.15.0-linux-armv7l'],
    ['CPB579', 'node-v22.15.0-linux-arm64'],
  ] as const

  for (const [controller, runtime] of cases) {
    const config = loadConfig(runtime)

    assert.equal(config.nodeVersionDir, runtime, controller)
    assert.equal(config.main, 'start.cjs')
    assert.equal(config.startScriptTemplate, 'node-web')
    assert.equal(config.healthPorts, '3080')
    assert.equal(config.healthPaths, '/api/livez')
    assert.match(config.dependencies ?? '', /(?:^|,)90005102(?:,|$)/)
    assert.doesNotMatch(config.dependencies ?? '', /(?:^|,)90005101(?:,|$)/)
  }
})

test('delegates ownership and startup policy to vpos-mono-package-mgr', () => {
  const config = loadConfig('node-v22.15.0-linux-arm64')

  assert.equal(config.installUser, undefined)
  assert.equal(config.installOwner, undefined)
  assert.equal(config.autoStartAfterInstall, undefined)
  assert.equal(config.autoStartOnBoot, undefined)
  assert.equal(config.systemdServiceName, undefined)
})

test('builds only CPB539 Node 22 and CPB579 Node 22 packages', () => {
  const pipeline = fs.readFileSync(pipelinePath, 'utf8')
  const targetNames = [
    ...pipeline.matchAll(/^\s+name:\s*['"](cpb-[^'"]+)['"]\s*$/gm),
  ].map((match) => match[1])

  assert.deepEqual(targetNames, ['cpb-539-node22', 'cpb-579-node22'])
  assert.match(
    pipeline,
    /nodeVersionDir:\s*['"]node-v22\.15\.0-linux-armv7l['"]/,
  )
  assert.match(
    pipeline,
    /nodeVersionDir:\s*['"]node-v22\.15\.0-linux-arm64['"]/,
  )
  assert.match(pipeline, /runtimeArchitecture:\s*['"]armv7l['"]/)
  assert.match(pipeline, /runtimeArchitecture:\s*['"]arm64['"]/)
  assert.doesNotMatch(pipeline, /node-v18|node18|18\.12\.1/i)
})

test('packages direct start.cjs runtime dependencies', () => {
  const pipeline = fs.readFileSync(pipelinePath, 'utf8')

  assert.match(
    pipeline,
    /nextRuntimeIncludes:[\s\S]*src\/platform\/runtime\/env-defaults\.cjs/,
  )
  assert.match(pipeline, /nextRuntimeIncludes:[\s\S]*scripts\/trace-net\.cjs/)
  assert.match(pipeline, /nextRuntimeRequiredPaths:[\s\S]*start\.cjs/)
  assert.match(pipeline, /nextRuntimeRequiredPaths:[\s\S]*vpos-server\.cjs/)
  assert.match(
    pipeline,
    /nextRuntimeRequiredPaths:[\s\S]*src\/platform\/runtime\/env-defaults\.cjs/,
  )
})

test('declares Node 22 as the only supported application runtime', () => {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
    engines?: { node?: string }
  }

  assert.equal(packageJson.engines?.node, '>=22.15.0 <23')
})
