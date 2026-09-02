import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('supervised DOMS clear always sends an empty PaymentParameters object', () => {
  const service = read(
    'src/modules/forecourt/infrastructure/jpl/transactionService.ts',
  )
  const schema = read(
    'src/modules/forecourt/infrastructure/jpl/protocol/schema.ts',
  )

  assert.match(service, /name: 'clear_FpSupTrans_req'/)
  assert.match(service, /subCode: '04H'/)
  assert.match(service, /Vol_e: extra\.Vol_e/)
  assert.match(service, /Money_e: extra\.Money_e/)
  assert.match(service, /const paymentParameters = \{\}/)
  assert.match(service, /PaymentParameters: paymentParameters/)
  assert.match(service, /requires Vol_e and Money_e/)
  assert.match(service, /PSS\/JTM requires PaymentParameters/)
  assert.match(service, /ReferenceNo omitted/)
  assert.doesNotMatch(service, /ReferenceNo: \[0\]/)
  assert.doesNotMatch(service, /subCode:\s*useExtended\s*\?\s*'04H'\s*:\s*'00H'/)

  assert.match(schema, /clear_FpSupTrans_req:[\s\S]*subCode: z\.literal\('04H'\)/)
  assert.match(schema, /Vol_e: dec10Schema/)
  assert.match(schema, /Money_e: dec10Schema/)
  assert.match(
    schema,
    /ReferenceNo: z[\s\S]*?array\(z\.number\(\)\.int\(\)\.min\(0\)\.max\(255\)\)[\s\S]*?\.optional\(\)/,
  )
  const clearSchemaStart = schema.indexOf('clear_FpSupTrans_req:')
  const clearSchemaEnd = schema.indexOf('change_FcStatusUpdateMode_req:', clearSchemaStart)
  const clearSchema = schema.slice(clearSchemaStart, clearSchemaEnd)
  assert.ok(clearSchemaStart >= 0)
  assert.ok(clearSchemaEnd > clearSchemaStart)
  assert.match(clearSchema, /ReferenceNo:[\s\S]*?\.optional\(\)/)
})

test('command facade collects supervised ETS values before clear when callers only provide identity', () => {
  const commands = read(
    'src/platform/integrations/jpl/commands/transactions.ts',
  )

  assert.match(commands, /resolveSupervisedClearTransaction/)
  assert.match(commands, /buildReadSupervisedTransactionRequest/)
  assert.match(commands, /Timed out reading supervised transaction before clear/)
  assert.match(commands, /posId: args\.posId/)
  assert.match(commands, /transSeqNo: args\.transSeqNo/)

  const complete = commands.indexOf("if (cmd.type === 'COMPLETE_TRANSACTION')")
  const collect = commands.indexOf(
    'await resolveSupervisedClearTransaction({',
    complete,
  )
  const clear = commands.indexOf(
    'buildClearSupervisedTransactionRequest({',
    collect,
  )
  assert.ok(complete >= 0)
  assert.ok(collect > complete)
  assert.ok(clear > collect)
})

test('DOMS clear is only acknowledged locally after buffer disappearance is verified', () => {
  const replay = read('src/modules/forecourt/infrastructure/jpl/replay.ts')
  const recovery = read(
    'src/modules/forecourt/infrastructure/jpl/transactionRecovery.ts',
  )
  const verifier = read(
    'src/modules/forecourt/infrastructure/jpl/transactionBufferStatus.ts',
  )

  assert.match(verifier, /verifyTransactionAbsentFromBuffer/)
  assert.match(verifier, /transactionBufferContains/)
  assert.match(verifier, /still contains[\s\S]*after clear response/)

  const supervisedRequest = replay.indexOf(
    'await (client as any).request(clearRequest)',
  )
  const supervisedVerify = replay.indexOf(
    'await verifyTransactionAbsentFromBuffer({',
    supervisedRequest,
  )
  const supervisedMark = replay.indexOf(
    "markBufferCleared('supervised'",
    supervisedVerify,
  )
  assert.ok(supervisedRequest >= 0)
  assert.ok(supervisedVerify > supervisedRequest)
  assert.ok(supervisedMark > supervisedVerify)

  const recoveryRequest = recovery.indexOf('await input.client.request(request)')
  const recoveryComplete = recovery.indexOf('await completeCheckpointAsCleared', recoveryRequest)
  assert.ok(recoveryRequest >= 0)
  assert.ok(recoveryComplete > recoveryRequest)
  assert.match(
    recovery.slice(recoveryRequest, recoveryComplete),
    /verifyTransactionAbsentFromBuffer/,
  )
})
