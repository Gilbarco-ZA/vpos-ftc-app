const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const OUTPUT_PATH = path.resolve(
  process.argv[2] || 'artifacts/doms-release-evidence.json',
)

const checks = [
  { id: 'build', command: 'npm', args: ['run', 'build'] },
  { id: 'test', command: 'npm', args: ['run', 'test'] },
  { id: 'jpl-protocol', command: 'npm', args: ['run', 'test:jpl-protocol'] },
  {
    id: 'jpl-simulator-selftest',
    command: 'npm',
    args: ['run', 'doms:jpl-sim:selftest'],
  },
  {
    id: 'jpl-simulator-validation',
    command: 'npm',
    args: ['run', 'doms:jpl-sim:validate'],
  },
  { id: 'todo-progress', command: 'npm', args: ['run', 'update-todo'] },
]

function runCheck(check) {
  const startedAt = new Date()
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const finishedAt = new Date()

  return {
    id: check.id,
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal || null,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

const generatedAt = new Date().toISOString()
const results = []

for (const check of checks) {
  const result = runCheck(check)
  results.push(result)
  process.stdout.write(
    `${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.command}\n`,
  )

  if (result.status !== 'passed') break
}

const report = {
  schemaVersion: 1,
  evidenceType: 'doms-release-verification',
  generatedAt,
  repository: '@gilbarcoafs/vpos-ftc-app',
  overallStatus:
    results.length === checks.length && results.every((item) => item.status === 'passed')
      ? 'passed'
      : 'failed',
  summary: {
    requested: checks.length,
    executed: results.length,
    passed: results.filter((item) => item.status === 'passed').length,
    failed: results.filter((item) => item.status === 'failed').length,
  },
  results,
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Release evidence written to ${OUTPUT_PATH}`)

process.exitCode = report.overallStatus === 'passed' ? 0 : 1
