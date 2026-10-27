#!/usr/bin/env node
'use strict'

// Locally stage the application files, not the DOMS/FccWebApp installer.
// Azure's vpos-mono-package-mgr remains authoritative for install metadata.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const stage = path.resolve(root, process.env.DOMS_STAGE_DIR || 'artifacts/doms-root/opt/fccapps/vpos-ftc')
const standalone = path.join(root, '.next', 'standalone')
const die = message => { console.error('[package:doms] ' + message); process.exit(1) }
const inside = (parent, child) => child.startsWith(parent + path.sep)
if (stage === root || !inside(root, stage) || inside(path.join(root, '.next'), stage) ||
    inside(path.join(root, 'node_modules'), stage)) {
  die('DOMS_STAGE_DIR must be a safe directory inside the repository, outside .next and node_modules')
}
const required = relative => {
  const full = path.join(root, relative)
  if (!fs.existsSync(full)) die('Missing required build artifact: ' + relative)
  return full
}
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, force: true, dereference: false })
}
if (process.env.DOMS_STAGE_SKIP_BUILD !== '1') {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error || result.status !== 0) die('npm run build failed; no staged deployment produced')
}
required('.next/standalone')
required('.next/static')
required('start.cjs')
required('vpos-server.cjs')
required('src/platform/runtime/env-defaults.cjs')
required('scripts/trace-net.cjs')
if (inside(stage, standalone)) die('Staging directory cannot be inside the build output')
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })
copy(standalone, stage)
copy(required('.next/static'), path.join(stage, '.next/static'))
if (fs.existsSync(path.join(root, 'public'))) copy(path.join(root, 'public'), path.join(stage, 'public'))
for (const relative of [
  'start.cjs',
  'vpos-server.cjs',
  'src/platform/runtime/env-defaults.cjs',
  'scripts/trace-net.cjs',
]) copy(required(relative), path.join(stage, relative))
if (fs.existsSync(path.join(root, 'scripts/migrations'))) {
  copy(path.join(root, 'scripts/migrations'), path.join(stage, 'scripts/migrations'))
}
const manifest = {
  kind: 'doms-local-runtime-staging',
  source: 'npm run build / Next.js standalone',
  version: require(path.join(root, 'package.json')).version,
  deploymentPath: '/opt/fccapps/vpos-ftc',
  targetNode: '22.15.0',
  note: 'Staged runtime only. Not a DOMS installer package; excludes system services, install scripts, controller-specific Node binaries and persistent configuration.',
}
fs.writeFileSync(path.join(stage, 'staging-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('[package:doms] Staged application directory: ' + stage)
console.log('[package:doms] Copy this tree only through an approved deployment process; do not overwrite /opt/fccapps/vpos-perm.')
