import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('DOMS buffer capture and pump-session capture converge on one transaction row', () => {
  const ingest = read(
    'src/modules/forecourt/infrastructure/jpl/ingestFromForecourt.ts',
  )
  const handler = read(
    'src/modules/pumps/infrastructure/transactionHandler.ts',
  )
  const correlation = read(
    'src/modules/transactions/infrastructure/forecourtTransactionCorrelation.ts',
  )

  assert.match(correlation, /forecourt-transaction-instance:/)
  assert.match(ingest, /buildForecourtTransactionCorrelationLockKey/)
  assert.match(handler, /buildForecourtTransactionCorrelationLockKey/)
  assert.match(ingest, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/)
  assert.match(handler, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/)
  assert.match(
    ingest,
    /transaction_date_time - \$6::timestamptz[\s\S]*<= \$7::int/,
  )
  assert.match(
    handler,
    /transaction_date_time - \$6::timestamptz[\s\S]*<= \$7::int/,
  )
  assert.doesNotMatch(
    ingest,
    /ABS\(EXTRACT\(EPOCH FROM \(created_at - NOW\(\)\)\)\)/,
  )
  assert.doesNotMatch(
    handler,
    /COALESCE\(doms_first_seen_at, created_at\) - NOW\(\)/,
  )

  assert.match(ingest, /pos_reference LIKE 'forecourt:%'/)
  assert.match(ingest, /doms_transaction_identity IS NULL/)
  assert.match(ingest, /doms_source_system = 'jpl'/)
  assert.match(ingest, /doms_transaction_identity = \$13/)

  assert.match(handler, /doms_transaction_identity IS NOT NULL/)
  assert.match(handler, /ABS\(total_amount - \$4::numeric\) <= 0\.01/)
  assert.match(handler, /ABS\(volume - \$5::numeric\) <= 0\.001/)
  assert.match(handler, /source_queue_id = COALESCE\(source_queue_id, \$3::uuid\)/)
  assert.match(handler, /WHERE NOT EXISTS \(\s*SELECT 1 FROM transaction_lines/)
  assert.match(handler, /status NOT IN \('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED'\)/)
  assert.match(ingest, /WHEN status IN \('FISCALIZED', 'PRINTED', 'REPRINTED', 'CREDITED'\) THEN total_amount/)
  assert.match(ingest, /requireExistingSessionMatch\?: boolean/)
  assert.match(ingest, /if \(args\.requireExistingSessionMatch\) \{\s*return null/)

  const events = read('src/modules/forecourt/infrastructure/jpl/events.ts')
  assert.match(events, /requireExistingSessionMatch: true/)
  assert.match(
    events,
    /attempting correlation to an existing pump-session transaction/,
  )
})
