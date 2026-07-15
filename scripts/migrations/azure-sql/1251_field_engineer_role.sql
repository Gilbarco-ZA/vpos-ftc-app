-- Add the dedicated field_engineer role used by the DOMS/PSS write safety gate.
DECLARE @constraintName NVARCHAR(128);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c
  ON c.default_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID('users')
  AND c.name = 'role';

DECLARE @checkName NVARCHAR(128);
SELECT TOP 1 @checkName = cc.name
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID('users')
  AND cc.definition LIKE '%role%';

IF @checkName IS NOT NULL
  EXEC('ALTER TABLE users DROP CONSTRAINT [' + @checkName + ']');

ALTER TABLE users
  ADD CONSTRAINT CK_users_role
  CHECK (role IN ('administrator', 'manager', 'tenant', 'field_engineer'));
