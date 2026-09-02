import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appConfig = fs.readFileSync('src/platform/config/app-config.ts', 'utf8')
const server = fs.readFileSync('server.ts', 'utf8')
const firstBoot = fs.readFileSync('src/platform/bootstrap/first-boot.ts', 'utf8')
const retry = fs.readFileSync(
  'src/modules/legacy-import/application/retryLegacyImport.ts',
  'utf8',
)
const importer = fs.readFileSync(
  'src/modules/setup/infrastructure/legacy-importer/index.ts',
  'utf8',
)
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const gitignore = fs.readFileSync('.gitignore', 'utf8')
const hygieneCheck = fs.readFileSync(
  'scripts/check-repository-hygiene.mjs',
  'utf8',
)

test('legacy import defaults archive under the vposftc permanent directory', () => {
  assert.match(appConfig, /DEFAULT_PERM_DIR = '\/opt\/fccapps\/vpos-perm\/vposftc'/)
  assert.match(appConfig, /DEFAULT_LEGACY_PERM_DIR = '\/opt\/fccapps\/vpos-perm\/vposfiscal'/)
  assert.match(appConfig, /DEFAULT_LEGACY_ARCHIVE_DIR = `\$\{DEFAULT_PERM_DIR\}\/legacy-archive`/)
  assert.doesNotMatch(server, /vposfiscal\/legacy/)
})

test('all runtime import entry points use shared path resolvers', () => {
  for (const source of [server, firstBoot, retry]) {
    assert.match(source, /getLegacyPermDir\(\)/)
    assert.match(source, /getLegacyArchiveDir\(\)/)
  }
  assert.match(importer, /opts\.moveAsideRoot \?\? getLegacyArchiveDir\(\)/)
})

test('the standalone server bundle is generated rather than committed source', () => {
  assert.match(
    packageJson.scripts['server:gen'],
    /esbuild server\.ts .*--outfile=vpos-server\.cjs/,
  )
  assert.match(gitignore, /^\/vpos-server\.cjs$/m)
  assert.match(hygieneCheck, /'vpos-server\.cjs'/)
})
