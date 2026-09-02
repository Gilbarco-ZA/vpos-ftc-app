-- Phase 2B: make plain text the canonical receipt presentation.
--
-- Legacy rows may continue to carry stored HTML. New writers persist NULL HTML
-- and generate it on read using the versioned renderer recorded on the row.

ALTER TABLE receipts
  ALTER COLUMN html_content DROP NOT NULL;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS render_version SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'receipts_printable_content_check'
      AND conrelid = 'receipts'::regclass
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_printable_content_check
      CHECK (
        NULLIF(BTRIM(plain_text_content), '') IS NOT NULL
        OR NULLIF(BTRIM(html_content), '') IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE receipts
  VALIDATE CONSTRAINT receipts_printable_content_check;

COMMENT ON COLUMN receipts.plain_text_content IS
  'Canonical immutable printable receipt content for new rows.';
COMMENT ON COLUMN receipts.html_content IS
  'Legacy compatibility HTML. New rows store NULL and render HTML from plain_text_content.';
COMMENT ON COLUMN receipts.render_version IS
  'Version of the deterministic plain-text-to-HTML receipt renderer.';
