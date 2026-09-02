const Module = require('node:module')
const path = require('node:path')

const enabledPackages = new Set(
  String(process.env.VPOS_TEST_STUB_PACKAGES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const stubs = new Map([
  [
    '@gilbarcoafs/doms-pos-jpl',
    path.join(__dirname, 'private-package-stubs', 'doms-pos-jpl.cjs'),
  ],
  [
    '@gilbarcoafs/vpos-common',
    path.join(__dirname, 'private-package-stubs', 'vpos-common.cjs'),
  ],
])

const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (enabledPackages.has(request) && stubs.has(request)) {
    return stubs.get(request)
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}
