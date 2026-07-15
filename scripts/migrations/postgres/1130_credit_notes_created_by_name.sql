-- Normalize credit_notes creator column to created_by_name text for app compatibility

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'credit_notes'
          AND column_name = 'created_by'
    ) THEN
        ALTER TABLE credit_notes
            ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);

        UPDATE credit_notes
           SET created_by_name = COALESCE(created_by_name, created_by::text)
         WHERE created_by IS NOT NULL;

        ALTER TABLE credit_notes
            DROP COLUMN IF EXISTS created_by;
    ELSE
        ALTER TABLE IF EXISTS credit_notes
            ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
    END IF;
END $$;
