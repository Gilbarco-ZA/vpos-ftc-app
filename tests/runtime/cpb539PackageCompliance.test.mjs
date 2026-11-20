import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const configFile = fileURLToPath(new URL('../../.config/config.js', import.meta.url))

const loadConfigFor = (target) => {
  const before = process.env.FNEZ_PACKAGE_TARGET_NAME
  try {
    if (target) process.env.FNEZ_PACKAGE_TARGET_NAME = target
    else delete process.env.FNEZ_PACKAGE_TARGET_NAME
    delete require.cache[configFile]
    return require(configFile).config
  } finally {
    if (before === undefined) delete process.env.FNEZ_PACKAGE_TARGET_NAME
    else process.env.FNEZ_PACKAGE_TARGET_NAME = before
    delete require.cache[configFile]
  }
}

test('CPB539 Node22 FTC opts in to complete uninstall with persistence hook', () => {
  const config = loadConfigFor('cpb-539-node22')
  assert.equal(config.completeUninstallAppRoot, true)
  assert.equal(config.enableNodeWebPersistHook, true)
  assert.equal(config.domsAppId, '472-22')
  assert.equal(config.name, 'vposftc')
})

test('CPB579 remains on its independent lifecycle and uninstall contract', () => {
  const config = loadConfigFor('cpb-579-node22')
  assert.equal(config.completeUninstallAppRoot, false)
  assert.equal(config.enableNodeWebPersistHook, false)
})

test('undeclared package targets must not silently enable destructive uninstall', () => {
  const config = loadConfigFor(undefined)
  assert.equal(config.completeUninstallAppRoot, false)
})
