-- Contact edits and portal contact deletes used to write the whole
-- CustomerContact row into the audit trail, bcrypt hash included, and
-- MANAGER+ can read every before/after there. The routes now omit the hash;
-- strip it from the rows already written. Data-only, no schema change.
UPDATE "AuditLog" SET "before" = "before" - 'passwordHash'
WHERE jsonb_typeof("before") = 'object' AND "before" ? 'passwordHash';

UPDATE "AuditLog" SET "after" = "after" - 'passwordHash'
WHERE jsonb_typeof("after") = 'object' AND "after" ? 'passwordHash';
