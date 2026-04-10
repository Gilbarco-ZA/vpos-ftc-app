BEGIN;

UPDATE transactions t
   SET pos_reference = UPPER(BTRIM(t.pos_reference)),
       updated_at = NOW()
 WHERE t.pos_reference IS NOT NULL
   AND BTRIM(t.pos_reference) <> ''
   AND t.pos_reference <> UPPER(BTRIM(t.pos_reference));

COMMIT;
