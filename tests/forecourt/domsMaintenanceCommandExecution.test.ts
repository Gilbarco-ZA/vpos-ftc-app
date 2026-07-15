import assert from 'node:assert/strict'
import test from 'node:test'

import { executeDomsMaintenanceCommand } from '../../src/modules/forecourt/application/executeDomsMaintenanceCommand'
import { digestDomsMaintenanceValue } from '../../src/modules/forecourt/application/domsMaintenanceCommandDigest'
import { evaluateDomsMaintenanceExecutionPermit } from '../../src/modules/forecourt/application/domsMaintenanceExecutionPermit'

const now = new Date('2026-07-13T08:00:00.000Z')
const secret = 'a'.repeat(64)
const fingerprint = 'pss-site-001-cert-sha256'
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'field.engineer',
  email: 'field.engineer@example.test',
  role: 'field_engineer' as const,
  stationId: '22222222-2222-4222-8222-222222222222',
  station: {
    id: '22222222-2222-4222-8222-222222222222',
    code: 'TEST',
    name: 'Test Station',
    country: 'ZA',
  },
}
const envelope = {
  name: 'clear_InstallData_req',
  subCode: '01H',
  data: { ExtendedInstallMsgCode: '76A4H', FcDeviceId: '12' },
}
const commandDigest = digestDomsMaintenanceValue(envelope)
const enabledEnv = {
  DOMS_PSS_WRITE_EXECUTION_ENABLED: 'true',
  DOMS_PSS_WRITE_KILL_SWITCH: 'false',
  DOMS_PSS_WRITE_PERMIT_SECRET: secret,
  DOMS_PSS_TARGET_FINGERPRINT: fingerprint,
}

const makePermit = () => {
  const result = evaluateDomsMaintenanceExecutionPermit(
    {
      stationId: user.stationId,
      sessionId: 'session-1',
      commandName: envelope.name,
      commandDigest,
      comparisonDigest: commandDigest,
      confirmationId: 'confirmation-1',
      confirmationExpiresAt: '2026-07-13T08:01:00.000Z',
      reconciliationObservedAt: '2026-07-13T07:59:30.000Z',
      sessionExpiresAt: '2026-07-13T09:00:00.000Z',
      targetFingerprint: fingerprint,
      confirmTargetFingerprint: true,
      confirmOneTimePermit: true,
      confirmKillSwitchReviewed: true,
    },
    user,
    {
      env: enabledEnv,
      now,
      fieldValidationComplete: true,
      trustedApproval: {
        signOffId: '33333333-3333-4333-8333-333333333333',
        acceptanceDigest: 'acceptance-digest-1',
        deploymentArtifact: 'release-1',
      },
    },
  )
  assert.equal(result.allowed, true)
  if (!result.allowed) throw new Error('permit was not issued')
  return result.permit
}

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  claimPermit: async () => true,
  completeClaim: async () => undefined,
  sendEnvelope: async () => ({
    name: 'clear_InstallData_resp',
    subCode: '01H',
    solicited: true,
    data: {},
  }),
  createAudit: async () => ({ id: 'audit-1' }),
  recordEvent: async () => undefined,
  ...overrides,
})

test('executes an exact permit-bound envelope and consumes the permit', async () => {
  let sent = 0
  const result = await executeDomsMaintenanceCommand(
    {
      permit: makePermit(),
      envelope,
      confirmImmediateExecution: true,
      confirmPermitWillBeConsumed: true,
    },
    user as any,
    {
      env: enabledEnv,
      now: new Date('2026-07-13T08:00:10.000Z'),
      dependencies: dependencies({
        sendEnvelope: async () => {
          sent += 1
          return { name: 'clear_InstallData_resp', subCode: '01H', data: {} }
        },
      }) as any,
    },
  )

  assert.equal(result.success, true)
  assert.equal(result.permitConsumed, true)
  assert.equal(sent, 1)
})

test('rejects replayed permits before sending', async () => {
  let sent = 0
  await assert.rejects(
    executeDomsMaintenanceCommand(
      {
        permit: makePermit(),
        envelope,
        confirmImmediateExecution: true,
        confirmPermitWillBeConsumed: true,
      },
      user as any,
      {
        env: enabledEnv,
        now: new Date('2026-07-13T08:00:10.000Z'),
        dependencies: dependencies({
          claimPermit: async () => false,
          sendEnvelope: async () => {
            sent += 1
            return {}
          },
        }) as any,
      },
    ),
    /already been consumed/,
  )
  assert.equal(sent, 0)
})

test('rejects command drift before claiming or sending', async () => {
  let claimed = 0
  await assert.rejects(
    executeDomsMaintenanceCommand(
      {
        permit: makePermit(),
        envelope: { ...envelope, data: { ...envelope.data, FcDeviceId: '13' } },
        confirmImmediateExecution: true,
        confirmPermitWillBeConsumed: true,
      },
      user as any,
      {
        env: enabledEnv,
        now: new Date('2026-07-13T08:00:10.000Z'),
        dependencies: dependencies({
          claimPermit: async () => {
            claimed += 1
            return true
          },
        }) as any,
      },
    ),
    /digest drift/,
  )
  assert.equal(claimed, 0)
})

test('rechecks the kill switch at command execution time', async () => {
  await assert.rejects(
    executeDomsMaintenanceCommand(
      {
        permit: makePermit(),
        envelope,
        confirmImmediateExecution: true,
        confirmPermitWillBeConsumed: true,
      },
      user as any,
      {
        env: { ...enabledEnv, DOMS_PSS_WRITE_KILL_SWITCH: 'true' },
        now: new Date('2026-07-13T08:00:10.000Z'),
        dependencies: dependencies() as any,
      },
    ),
    /kill switch is active/,
  )
})

test('consumes a permit permanently when the PSS command fails', async () => {
  const completions: any[] = []
  await assert.rejects(
    executeDomsMaintenanceCommand(
      {
        permit: makePermit(),
        envelope,
        confirmImmediateExecution: true,
        confirmPermitWillBeConsumed: true,
      },
      user as any,
      {
        env: enabledEnv,
        now: new Date('2026-07-13T08:00:10.000Z'),
        dependencies: dependencies({
          sendEnvelope: async () => {
            throw new Error('PSS rejected command')
          },
          completeClaim: async (value: unknown) => {
            completions.push(value)
          },
        }) as any,
      },
    ),
    /PSS rejected command/,
  )
  assert.equal(completions.at(-1)?.status, 'failed')
})
