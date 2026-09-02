-- Phase 2A: canonical print job types and reference-based pending payloads.
--
-- The print worker remains dual-read: canonical receipt/report rows are preferred,
-- while legacy embedded payloads remain executable. Only pending jobs with a
-- verified canonical source are compacted here; processing jobs are not mutated.

UPDATE print_jobs
SET job_type = 'print.receipt',
    updated_at = CURRENT_TIMESTAMP
WHERE job_type = 'TRANSACTION_RECEIPT'
  AND status <> 'PROCESSING';

UPDATE print_jobs
SET job_type = 'print.report',
    updated_at = CURRENT_TIMESTAMP
WHERE job_type = 'REPORT'
  AND status <> 'PROCESSING';

UPDATE print_jobs AS pj
SET payload = jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'storageMode', 'reference',
      'copies', COALESCE(
        NULLIF(pj.payload -> 'copies', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,copies}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,copies}', 'null'::jsonb)
      ),
      'copyCount', COALESCE(
        NULLIF(pj.payload -> 'copyCount', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,copyCount}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,copyCount}', 'null'::jsonb)
      ),
      'correlationId', COALESCE(
        NULLIF(pj.payload -> 'correlationId', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,correlationId}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,correlationId}', 'null'::jsonb)
      ),
      'deviceKey', COALESCE(
        NULLIF(pj.payload -> 'deviceKey', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,deviceKey}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,deviceKey}', 'null'::jsonb)
      ),
      'isReprint', COALESCE(
        NULLIF(pj.payload -> 'isReprint', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,isReprint}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,isReprint}', 'null'::jsonb)
      ),
      'port', COALESCE(
        NULLIF(pj.payload -> 'port', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,port}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,port}', 'null'::jsonb)
      ),
      'printerIP', COALESCE(
        NULLIF(pj.payload -> 'printerIP', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printerIP}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printerIP}', 'null'::jsonb)
      ),
      'printerIp', COALESCE(
        NULLIF(pj.payload -> 'printerIp', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printerIp}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printerIp}', 'null'::jsonb)
      ),
      'printerKey', COALESCE(
        NULLIF(pj.payload -> 'printerKey', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printerKey}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printerKey}', 'null'::jsonb)
      ),
      'printer_key', COALESCE(
        NULLIF(pj.payload -> 'printer_key', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printer_key}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printer_key}', 'null'::jsonb)
      ),
      'receiptId', COALESCE(
        NULLIF(pj.payload -> 'receiptId', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,receiptId}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,receiptId}', 'null'::jsonb)
      ),
      'receiptNumber', COALESCE(
        NULLIF(pj.payload -> 'receiptNumber', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,receiptNumber}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,receiptNumber}', 'null'::jsonb)
      ),
      'reportId', COALESCE(
        NULLIF(pj.payload -> 'reportId', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,reportId}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,reportId}', 'null'::jsonb)
      ),
      'pumpNumber', COALESCE(
        NULLIF(pj.payload -> 'pumpNumber', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,pumpNumber}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,pumpNumber}', 'null'::jsonb)
      ),
      'pump_number', COALESCE(
        NULLIF(pj.payload -> 'pump_number', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,pump_number}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,pump_number}', 'null'::jsonb)
      ),
      'source', COALESCE(
        NULLIF(pj.payload -> 'source', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,source}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,source}', 'null'::jsonb)
      ),
      'timeoutMs', COALESCE(
        NULLIF(pj.payload -> 'timeoutMs', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,timeoutMs}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,timeoutMs}', 'null'::jsonb)
      ),
      'type', COALESCE(
        NULLIF(pj.payload -> 'type', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,type}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,type}', 'null'::jsonb)
      ),
      'width', COALESCE(
        NULLIF(pj.payload -> 'width', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,width}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,width}', 'null'::jsonb)
      )
    )),
    updated_at = CURRENT_TIMESTAMP
WHERE pj.status = 'PENDING'
  AND pj.job_type = 'print.receipt'
  AND pj.source_transaction_id IS NOT NULL
  AND COALESCE(
    NULLIF(BTRIM(pj.payload ->> 'source'), ''),
    NULLIF(BTRIM(pj.payload #>> '{data,source}'), '')
  ) IN ('vpos.transaction-receipt', 'vpos.auto-print-receipt')
  AND EXISTS (
    SELECT 1
    FROM receipts AS receipt
    WHERE receipt.station_id = pj.station_id
      AND receipt.transaction_id = pj.source_transaction_id
      AND (
        COALESCE(
          NULLIF(BTRIM(pj.payload ->> 'receiptId'), ''),
          NULLIF(BTRIM(pj.payload #>> '{data,receiptId}'), '')
        ) IS NULL
        OR receipt.id::text = COALESCE(
          NULLIF(BTRIM(pj.payload ->> 'receiptId'), ''),
          NULLIF(BTRIM(pj.payload #>> '{data,receiptId}'), '')
        )
      )
  );

UPDATE print_jobs AS pj
SET payload = jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'storageMode', 'reference',
      'copies', COALESCE(
        NULLIF(pj.payload -> 'copies', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,copies}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,copies}', 'null'::jsonb)
      ),
      'copyCount', COALESCE(
        NULLIF(pj.payload -> 'copyCount', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,copyCount}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,copyCount}', 'null'::jsonb)
      ),
      'correlationId', COALESCE(
        NULLIF(pj.payload -> 'correlationId', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,correlationId}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,correlationId}', 'null'::jsonb)
      ),
      'deviceKey', COALESCE(
        NULLIF(pj.payload -> 'deviceKey', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,deviceKey}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,deviceKey}', 'null'::jsonb)
      ),
      'isReprint', COALESCE(
        NULLIF(pj.payload -> 'isReprint', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,isReprint}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,isReprint}', 'null'::jsonb)
      ),
      'port', COALESCE(
        NULLIF(pj.payload -> 'port', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,port}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,port}', 'null'::jsonb)
      ),
      'printerIP', COALESCE(
        NULLIF(pj.payload -> 'printerIP', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printerIP}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printerIP}', 'null'::jsonb)
      ),
      'printerIp', COALESCE(
        NULLIF(pj.payload -> 'printerIp', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printerIp}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printerIp}', 'null'::jsonb)
      ),
      'printerKey', COALESCE(
        NULLIF(pj.payload -> 'printerKey', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printerKey}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printerKey}', 'null'::jsonb)
      ),
      'printer_key', COALESCE(
        NULLIF(pj.payload -> 'printer_key', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,printer_key}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,printer_key}', 'null'::jsonb)
      ),
      'receiptId', COALESCE(
        NULLIF(pj.payload -> 'receiptId', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,receiptId}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,receiptId}', 'null'::jsonb)
      ),
      'receiptNumber', COALESCE(
        NULLIF(pj.payload -> 'receiptNumber', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,receiptNumber}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,receiptNumber}', 'null'::jsonb)
      ),
      'reportId', COALESCE(
        NULLIF(pj.payload -> 'reportId', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,reportId}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,reportId}', 'null'::jsonb)
      ),
      'pumpNumber', COALESCE(
        NULLIF(pj.payload -> 'pumpNumber', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,pumpNumber}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,pumpNumber}', 'null'::jsonb)
      ),
      'pump_number', COALESCE(
        NULLIF(pj.payload -> 'pump_number', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,pump_number}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,pump_number}', 'null'::jsonb)
      ),
      'source', COALESCE(
        NULLIF(pj.payload -> 'source', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,source}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,source}', 'null'::jsonb)
      ),
      'timeoutMs', COALESCE(
        NULLIF(pj.payload -> 'timeoutMs', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,timeoutMs}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,timeoutMs}', 'null'::jsonb)
      ),
      'type', COALESCE(
        NULLIF(pj.payload -> 'type', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,type}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,type}', 'null'::jsonb)
      ),
      'width', COALESCE(
        NULLIF(pj.payload -> 'width', 'null'::jsonb),
        NULLIF(pj.payload #> '{data,width}', 'null'::jsonb),
        NULLIF(pj.payload #> '{printable,width}', 'null'::jsonb)
      )
    )),
    updated_at = CURRENT_TIMESTAMP
WHERE pj.status = 'PENDING'
  AND pj.job_type = 'print.report'
  AND pj.source_report_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM reports AS report
    WHERE report.station_id = pj.station_id
      AND report.id = pj.source_report_id
  );

COMMENT ON COLUMN print_jobs.payload IS
  'Compact print routing/options. Receipt and report content should be resolved through source_transaction_id or source_report_id; legacy embedded payloads remain supported during migration.';
