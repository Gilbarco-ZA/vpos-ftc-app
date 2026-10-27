#!/usr/bin/env node
'use strict'

/**
 * Fetch an authentic DOMS package from the Azure pipeline, which delegates
 * packaging to vpos-mono-package-mgr. This script never creates its own archive.
 *
 * Required: Azure CLI with azure-devops extension and logged-in access.
 * Environment: DOMS_AZ_ORG, DOMS_AZ_PROJECT, DOMS_AZ_PIPELINE_ID.
 * Optional: DOMS_AZ_BRANCH (default main), DOMS_PACKAGE_OUTPUT.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function fail(message) {
  process.stderr.write('DOMS packaging: ' + message + '\n')
  process.exit(1)
}
const env = process.env
const org = env.DOMS_AZ_ORG
const project = env.DOMS_AZ_PROJECT
const pipeline = env.DOMS_AZ_PIPELINE_ID
if (!org || !project || !pipeline) {
  fail('Set DOMS_AZ_ORG, DOMS_AZ_PROJECT and DOMS_AZ_PIPELINE_ID for the existing production Azure pipeline.')
}
if (!/^\d+$/.test(pipeline)) fail('DOMS_AZ_PIPELINE_ID must be a numeric Azure pipeline ID')
const branch = env.DOMS_AZ_BRANCH || 'main'
const output = path.resolve(env.DOMS_PACKAGE_OUTPUT || 'artifacts/doms-packages')

function az(args) {
  const result = spawnSync('az', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) fail('Azure CLI unavailable: ' + result.error.message)
  if (result.status !== 0) {
    fail('Azure CLI failed: ' + args.join(' ') + '\n' + (result.stderr || result.stdout || '').trim())
  }
  return (result.stdout || '').trim()
}
const common = ['--organization', org, '--project', project]
let run
try {
  run = JSON.parse(az([
    'pipelines', 'run', '--id', pipeline, '--branch', branch,
    ...common, '--output', 'json',
  ]))
} catch (error) {
  fail('Could not queue the production packaging pipeline: ' + String(error))
}
const id = String(run.id ?? '')
if (!/^\d+$/.test(id)) fail('Azure pipeline did not return a valid run ID')
process.stdout.write('Queued DOMS package pipeline run ' + id + '\n')
process.stdout.write('Waiting for the existing pipeline to complete. No local package will be fabricated.\n')
const wait = Number(env.DOMS_PACKAGE_POLL_SECONDS || '15')
if (!Number.isInteger(wait) || wait < 5 || wait > 120) fail('DOMS_PACKAGE_POLL_SECONDS must be 5..120')
const maxChecks = Number(env.DOMS_PACKAGE_MAX_CHECKS || '120')
if (!Number.isInteger(maxChecks) || maxChecks < 1 || maxChecks > 500) fail('DOMS_PACKAGE_MAX_CHECKS must be 1..500')
const sleep = ms => { const buffer = new SharedArrayBuffer(4); Atomics.wait(new Int32Array(buffer), 0, 0, ms) }
let completed = false
for (let attempt = 0; attempt < maxChecks; attempt++) {
  const status = JSON.parse(az([
    'pipelines', 'runs', 'show', '--id', id, ...common, '--output', 'json',
  ]))
  if (status.state === 'completed') {
    if (status.result !== 'succeeded') fail('Package pipeline run ' + id + ' completed with result: ' + status.result)
    completed = true
    break
  }
  sleep(wait * 1000)
}
if (!completed) fail('Timed out waiting for run ' + id + '. Retrieve artifacts from Azure DevOps after it completes.')
fs.mkdirSync(output, { recursive: true })
az(['pipelines', 'runs', 'artifact', 'download', '--run-id', id,
  '--path', output, ...common])
process.stdout.write('Downloaded genuine DOMS pipeline artifacts to ' + output + '\n')
process.stdout.write('Check controller architecture (CPB539 armv7l or CPB579 arm64) before installation.\n')
