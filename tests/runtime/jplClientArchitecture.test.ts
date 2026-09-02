import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const clientPath = 'src/platform/integrations/jpl/client.ts'
const pricingFacadePath = 'src/platform/integrations/jpl/commands/pricing.ts'
const statusReadsPath = 'src/platform/integrations/jpl/protocol/statusReads.ts'
const orchestrationPath = 'src/platform/integrations/jpl/orchestration.ts'
const specialRecordPersistencePath =
  'src/platform/integrations/jpl/specialRecordPersistence.ts'
const pricingModulePaths = {
  mapping: 'src/platform/integrations/jpl/commands/pricing/mapping.ts',
  protocol: 'src/platform/integrations/jpl/commands/pricing/protocol.ts',
  read: 'src/platform/integrations/jpl/commands/pricing/read.ts',
  scheduling: 'src/platform/integrations/jpl/commands/pricing/scheduling.ts',
  handler: 'src/platform/integrations/jpl/commands/pricing/handler.ts',
}

const extractedCommandTypes = [
  'PING',
  'POS_STATUS',
  'GET_REPLAY_STATUS',
  'GET_FC_STATUS',
  'GET_POS_CONNECTION_STATUS',
  'GET_PSS_PERIPHERALS_STATUS',
  'GET_FC_SERVICE_LOG',
  'CLEAR_FC_SERVICE_LOG',
  'GET_BACK_OFFICE_RECORD',
  'CLEAR_BACK_OFFICE_RECORD',
  'GET_FP_STATUS',
  'GET_FP_INFO',
  'GET_FP_FUELLING_DATA',
  'GET_FP_ERROR',
  'PRESET_FUEL_AUTH',
  'EXTENDED_FUEL_AUTH',
  'PREPARE_TRANSACTION',
  'OPEN_FPS',
  'CLOSE_FPS',
  'ATTENDANT_AUTH',
  'PREFUEL_CUSTOMER',
  'CLEAR_PREFUEL_CUSTOMER',
  'CANCEL_TRANSACTION',
  'ESTOP_FP',
  'CANCEL_FP_ESTOP',
  'RESET_FP',
  'CLEAR_FP_ERROR',
  'OPEN_TANK_CONTROLLER',
  'CLOSE_TANK_CONTROLLER',
  'START_DELIVERY_PROCESS',
  'STOP_DELIVERY_PROCESS',
  'GET_TG_STATUS',
  'GET_TRANSACTION_BUFFER_STATUS',
  'GET_SITE_DELIVERY_STATUS',
  'GET_TANK_DELIVERY_DATA',
  'CLEAR_TANK_DELIVERY_DATA',
  'GET_SUPERVISED_TRANSACTION',
  'UNLOCK_SUPERVISED_TRANSACTION',
  'CLEAR_SUPERVISED_TRANSACTION',
  'GET_UNSUPERVISED_TRANSACTION',
  'UNLOCK_UNSUPERVISED_TRANSACTION',
  'CLEAR_UNSUPERVISED_TRANSACTION',
  'COMPLETE_TRANSACTION',
  'GET_ALL_TG_DATA',
  'CHANGE_DYNAMIC_TANK_DATA',
  'GET_TG_ERROR_MSG',
  'GET_GRADE_PRICES',
  'CLEAR_PENDING_PRICE_SET',
  'CHANGE_GRADE_PRICES',
  'GET_ALL_TANK_DELIVERY_DATA',
]

describe('JPL client command architecture', () => {
  it('keeps extracted command families outside the client facade', async () => {
    const source = await readFile(clientPath, 'utf8')

    assert.ok(
      source.split(/\r?\n/).length < 330,
      'client.ts should remain a facade below 330 lines rather than regrow into a monolithic dispatcher',
    )
    for (const forbiddenDefinition of [
      /(?:async\s+)?function\s+requestWithTimeout\b/,
      /(?:async\s+)?function\s+requestWithSubCodeFallback\b/,
      /(?:const|function)\s+normalizePriceValue\b/,
      /(?:const|function)\s+extractPendingPriceSets\b/,
      /(?:const|function)\s+extractDeliveryTgIdsFromSiteStatus\b/,
      /(?:const|function)\s+rememberGatewaySnapshot\b/,
      /(?:async\s+)?function\s+readFpStatus\b/,
      /(?:async\s+)?function\s+readTgStatus\b/,
      /(?:async\s+)?function\s+readBackOfficeRecord\b/,
      /(?:async\s+)?function\s+readTankDeliveryData\b/,
      /(?:const|function)\s+enqueueApc1\b/,
      /(?:const|function)\s+persistCollectedServiceMessage\b/,
      /(?:const|function)\s+persistCollectedBackOfficeRecord\b/,
    ]) {
      assert.equal(
        forbiddenDefinition.test(source),
        false,
        `shared protocol and extracted command logic must not be redefined in client.ts: ${forbiddenDefinition}`,
      )
    }

    for (const commandType of extractedCommandTypes) {
      assert.equal(
        source.includes(`if (cmd.type === '${commandType}')`),
        false,
        `${commandType} must remain owned by an extracted command handler`,
      )
    }

    for (const handler of [
      'handleLifecycleCommand',
      'handleControllerRecordCommand',
      'handlePricingCommand',
      'handlePumpCommand',
      'handleTankCommand',
      'handleTransactionCommand',
      'handleDeliveryCommand',
      'handleDirectCommand',
      'handleDynamicTankCommand',
    ]) {
      assert.match(source, new RegExp(`\\b${handler}\\b`))
    }
  })
  it('keeps pricing mapping, protocol, and scheduling logic outside the compatibility facade', async () => {
    const facade = await readFile(pricingFacadePath, 'utf8')
    assert.ok(
      facade.split(/\r?\n/).length < 60,
      'pricing.ts must remain a compatibility export facade below 60 lines',
    )
    for (const forbiddenDefinition of [
      /(?:const|function)\s+normalizePriceValue\b/,
      /(?:const|function)\s+toFcDateTime\b/,
      /(?:const|function)\s+mergePriceBank\b/,
      /(?:async\s+)?function\s+readPriceSetStatus\b/,
      /(?:async\s+)?function\s+changePriceSet\b/,
      /if\s*\(.*GET_GRADE_PRICES/,
      /if\s*\(.*CHANGE_GRADE_PRICES/,
    ]) {
      assert.equal(
        forbiddenDefinition.test(facade),
        false,
        `pricing logic must not return to pricing.ts: ${forbiddenDefinition}`,
      )
    }

    const limits = {
      mapping: 380,
      protocol: 180,
      read: 180,
      scheduling: 260,
      handler: 90,
    }
    for (const [name, path] of Object.entries(pricingModulePaths)) {
      const source = await readFile(path, 'utf8')
      assert.ok(
        source.split(/\r?\n/).length < limits[name as keyof typeof limits],
        `${name}.ts must remain focused below ${limits[name as keyof typeof limits]} lines`,
      )
    }
  })

  it('keeps command queueing and special-record persistence outside the client facade', async () => {
    const orchestration = await readFile(orchestrationPath, 'utf8')
    const persistence = await readFile(specialRecordPersistencePath, 'utf8')

    assert.ok(
      orchestration.split(/\r?\n/).length < 130,
      'orchestration.ts must remain focused below 130 lines',
    )
    assert.match(orchestration, /export const createSerializedCommandQueue\b/)
    assert.match(orchestration, /export const createGatewayStartCoordinator\b/)
    assert.match(
      orchestration,
      /export async function prepareJplCommandExecution\b/,
    )

    assert.ok(
      persistence.split(/\r?\n/).length < 160,
      'specialRecordPersistence.ts must remain focused below 160 lines',
    )
    assert.match(
      persistence,
      /export async function persistCollectedServiceMessage\b/,
    )
    assert.match(
      persistence,
      /export async function persistCollectedBackOfficeRecord\b/,
    )
  })

  it('keeps low-level status and read protocol behavior outside the client facade', async () => {
    const source = await readFile(statusReadsPath, 'utf8')
    assert.ok(
      source.split(/\r?\n/).length < 380,
      'statusReads.ts must remain a focused protocol reader module below 380 lines',
    )
    for (const helper of [
      'readFpStatus',
      'readFpInfo',
      'readFpFuellingData',
      'readFpError',
      'readTgStatus',
      'readSiteDeliveryStatus',
      'readTankDeliveryData',
      'readBackOfficeRecord',
    ]) {
      assert.match(source, new RegExp(`export async function ${helper}\\b`))
    }
  })

})
