import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildDomsFieldValidationChecklist,
  DOMS_FIELD_VALIDATION_AUTOMATED_CHECK_IDS,
  DOMS_FIELD_VALIDATION_CHECK_IDS,
} from '../../src/modules/forecourt/application/getDomsFieldValidationReadiness'

const baseline = () =>
  buildDomsFieldValidationChecklist({
    diagnostics: {
      connection: { connected: false, status: 'disconnected' },
      recent: { rejects: [], protocolEvents: [] },
    },
    reconciliation: {
      severity: 'warning',
      issues: [],
      summary: {},
    },
    workflow: { data: { commands: [], transactions: [] } },
    executionPolicy: {
      mode: 'preview-only',
      hardDisabled: true,
      canExecute: false,
      canPreview: true,
    },
    maintenanceSessions: { data: {} },
  })

describe('DOMS field validation readiness coverage', () => {
  it('defines every supported field-readiness check exactly once', () => {
    const checklist = baseline()
    const actualIds = checklist.map((item) => item.id)

    assert.deepEqual(actualIds, [...DOMS_FIELD_VALIDATION_CHECK_IDS])
    assert.equal(new Set(actualIds).size, actualIds.length)
    assert.equal(actualIds.some((id) => id.includes('build')), false)
    assert.equal(actualIds.some((id) => id.includes('test-suite')), false)
  })

  it('keeps automated command checks inside the supported checklist', () => {
    const supported = new Set<string>(DOMS_FIELD_VALIDATION_CHECK_IDS)

    for (const id of DOMS_FIELD_VALIDATION_AUTOMATED_CHECK_IDS) {
      assert.equal(supported.has(id), true, `${id} must be a checklist item`)
    }
  })

  it('gives every readiness check actionable evidence and guidance', () => {
    for (const item of baseline()) {
      assert.ok(item.title.trim(), `${item.id} must have a title`)
      assert.ok(item.description.trim(), `${item.id} must have a description`)
      assert.ok(item.nextAction.trim(), `${item.id} must have a next action`)
      assert.ok(item.evidence, `${item.id} must describe current/required evidence`)
      assert.ok(
        ['passed', 'pending', 'warning', 'blocked'].includes(item.status),
        `${item.id} has an unsupported status`,
      )
    }
  })

  it('derives observable readiness from diagnostics and safety state', () => {
    const checklist = buildDomsFieldValidationChecklist({
      diagnostics: {
        connection: { connected: true, status: 'connected' },
        lastAnyReceivedAt: new Date().toISOString(),
        recent: { rejects: [], protocolEvents: [{ type: 'heartbeat' }] },
      },
      reconciliation: {
        severity: 'ok',
        issues: [],
        summary: {
          installStatusSeenAt: new Date().toISOString(),
          remediationSuggestionCount: 0,
          unresolvedBlockingIssueCount: 0,
        },
      },
      workflow: { data: { commands: [], transactions: [] } },
      executionPolicy: {
        mode: 'preview-only',
        hardDisabled: true,
        canExecute: false,
        canPreview: true,
      },
      maintenanceSessions: { data: {} },
    })
    const status = Object.fromEntries(
      checklist.map((item) => [item.id, item.status]),
    )

    assert.equal(status['jpl-live-connection-observed'], 'passed')
    assert.equal(status['jpl-rejects-reviewed'], 'passed')
    assert.equal(status['fc-install-status-snapshot-captured'], 'passed')
    assert.equal(status['reconciliation-reviewed'], 'passed')
    assert.equal(status['maintenance-execution-disabled'], 'passed')
  })

  it('flags recent JPL rejects and unsafe maintenance execution', () => {
    const checklist = buildDomsFieldValidationChecklist({
      diagnostics: {
        connection: { connected: true, status: 'connected' },
        recent: {
          rejects: [{ rejectInfoText: 'syntax error' }],
          protocolEvents: [],
        },
      },
      reconciliation: {
        severity: 'warning',
        issues: [{ id: 'mapping-gap' }],
        summary: {},
      },
      workflow: { data: { commands: [], transactions: [] } },
      executionPolicy: {
        mode: 'execute',
        hardDisabled: false,
        canExecute: true,
        canPreview: true,
      },
      maintenanceSessions: { data: {} },
    })
    const status = Object.fromEntries(
      checklist.map((item) => [item.id, item.status]),
    )

    assert.equal(status['jpl-rejects-reviewed'], 'warning')
    assert.equal(status['reconciliation-reviewed'], 'warning')
    assert.equal(status['maintenance-execution-disabled'], 'blocked')
  })
})
