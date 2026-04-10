-- Add PENDING to transactions status check constraint (Azure SQL)
DECLARE @constraintName NVARCHAR(200);

SELECT @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.tables t ON t.object_id = cc.parent_object_id
WHERE t.name = 'transactions'
  AND cc.definition LIKE '%OPEN%ALLOCATED%FISCALIZING%'
  AND cc.definition LIKE '%FISCALIZED%'
  AND cc.definition LIKE '%REPRINTED%';

IF @constraintName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE transactions DROP CONSTRAINT ' + QUOTENAME(@constraintName));
END

ALTER TABLE transactions
ADD CONSTRAINT CK_transactions_status CHECK (status IN (
  'OPEN',
  'ALLOCATED',
  'PENDING',
  'FISCALIZING',
  'FISCALIZED',
  'FAILED',
  'PRINTED',
  'REPRINTED'
));
