import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const builder = readFileSync('scripts/package-doms.cjs', 'utf8')
test('DOMS local staging script is wired without Azure CLI', () => {
  assert.equal(packageJson.scripts['package:doms'], 'node scripts/package-doms.cjs')
  assert.match(builder, /'npm run build \/ Next\.js standalone'/)
  assert.doesNotMatch(builder, /pipelines.*run|spawnSync\('az'/)
})
test('DOMS staging includes required runtime and static assets', () => {
  for (const token of [
    "required('.next/standalone')",
    "required('.next/static')",
    "required('start.cjs')",
    "required('vpos-server.cjs')",
    "required('src/platform/runtime/env-defaults.cjs')",
    "required('scripts/trace-net.cjs')",
    "'scripts/migrations'",
  ]) assert.ok(builder.includes(token), 'missing staging evidence: ' + token)
  assert.match(builder, /fs\.rmSync\(stage/)
  assert.match(builder, /doms-local-runtime-staging/)
})
