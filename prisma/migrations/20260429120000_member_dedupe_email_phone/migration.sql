-- Drop the gym_id+phone composite index from Member (will be recreated on User)
DROP INDEX IF EXISTS "Member_gym_id_phone_idx";

-- Drop email and phone columns from Member (now lives only on User)
ALTER TABLE "Member" DROP COLUMN IF EXISTS "email";
ALTER TABLE "Member" DROP COLUMN IF EXISTS "phone";

-- Add helpful indexes on User for member-by-phone and member-by-role lookups
CREATE INDEX IF NOT EXISTS "User_gym_id_phone_idx" ON "User"("gym_id", "phone");
CREATE INDEX IF NOT EXISTS "User_gym_id_role_idx" ON "User"("gym_id", "role");

-- Replace the dropped Member index with a simpler gym_id index
CREATE INDEX IF NOT EXISTS "Member_gym_id_idx" ON "Member"("gym_id");
