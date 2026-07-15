-- Add the dedicated field_engineer role used by the DOMS/PSS write safety gate.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('administrator', 'manager', 'tenant', 'field_engineer'));
