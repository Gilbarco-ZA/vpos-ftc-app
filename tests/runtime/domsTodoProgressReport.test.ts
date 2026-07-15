import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  PROGRESS_END,
  PROGRESS_START,
  generateProgressReport,
  markdownAnchor,
  updateMarkdown,
} = require('../../scripts/update-doms-todo-progress.js')

describe('DOMS TODO progress report generator', () => {
  it('generates linked progress rows pointing to report sections', () => {
    const input = `# DOMS Integration Todo List

Old header

---

## 1) Finalize scope and integration contract

- [x] Complete one
- [ ] Complete two

## 15) Testing and validation

- [x] Run one
- [x] Run two
`

    const report = generateProgressReport(input, {
      now: new Date('2026-07-09T10:15:00Z'),
    })

    assert.equal(report.overall.completed, 3)
    assert.equal(report.overall.total, 4)
    assert.match(
      report.content,
      /\| \*\*\[1\) Finalize scope and integration contract\]\(#1-finalize-scope-and-integration-contract\)\*\* \| 1 \| 2 \|/,
    )
    assert.match(
      report.content,
      /\| \*\*\[15\) Testing and validation\]\(#15-testing-and-validation\)\*\* \| 2 \| 2 \|/,
    )
    assert.ok(report.content.includes(PROGRESS_MARKERS.start))
    assert.ok(report.content.includes(PROGRESS_MARKERS.end))
  })

  it('removes stale progress headers and duplicate timestamp leftovers', () => {
    const input = `# DOMS Integration Todo List

${PROGRESS_START}
**Overall Progress: 50%** (1 / 2 tasks completed)

*Last updated: July 8, 2026 at 01:00 PM*

### Per-Section Progress

| Section | Completed | Total | Progress |
|---------|-----------|-------|----------|
| **[Old](#old)** | 1 | 2 | ██████████░░░░░░░░░░ 50% |
${PROGRESS_END}

---

*Last updated: July 8, 2026 at 01:00 PM*

*Last updated: July 8, 2026 at 01:05 PM*

## Active Section

- [x] Current task
`

    const first = generateProgressReport(input, {
      now: new Date('2026-07-09T10:15:00Z'),
    }).content
    const second = generateProgressReport(first, {
      now: new Date('2026-07-09T10:16:00Z'),
    }).content

    assert.equal((first.match(/Last updated:/g) ?? []).length, 1)
    assert.equal((second.match(/Last updated:/g) ?? []).length, 1)
    assert.equal((second.match(new RegExp(PROGRESS_START, 'g')) ?? []).length, 1)
    assert.equal((second.match(new RegExp(PROGRESS_END, 'g')) ?? []).length, 1)
  })

  it('supports direct file updates for repo and temp-file workflows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doms-todo-progress-'))
    const filePath = join(dir, 'DOMS_INTEGRATION_TODO.md')

    try {
      writeFileSync(
        filePath,
        `# DOMS Integration Todo List

---

## 2) Transport, session, and connection management

- [x] Done
- [ ] Pending
`,
      )

      const report = updateMarkdown(filePath, {
        now: new Date('2026-07-09T10:15:00Z'),
        silent: true,
      })
      const written = readFileSync(filePath, 'utf-8')

      assert.equal(report.overall.completed, 1)
      assert.equal(report.overall.total, 2)
      assert.match(
        written,
        /\[2\) Transport, session, and connection management\]\(#2-transport-session-and-connection-management\)/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generates GitHub-compatible heading anchors', () => {
    assert.equal(
      markdownAnchor('21) Build, release, and field validation'),
      '21-build-release-and-field-validation',
    )
    assert.equal(
      markdownAnchor('DOMS/JPL reconciliation & FTC mapping remediation'),
      'domsjpl-reconciliation-and-ftc-mapping-remediation',
    )
  })
})

const PROGRESS_MARKERS = {
  start: PROGRESS_START,
  end: PROGRESS_END,
}
