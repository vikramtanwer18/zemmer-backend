-- Add COACH to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COACH';

-- Drop unique + indexes that reference dropped columns
DROP INDEX IF EXISTS "StaffMember_gym_id_email_key";
DROP INDEX IF EXISTS "StaffMember_gym_id_phone_idx";

-- Drop columns now living on User (email, phone) and replaced by User.role (instructorType)
ALTER TABLE "StaffMember" DROP COLUMN IF EXISTS "email";
ALTER TABLE "StaffMember" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "StaffMember" DROP COLUMN IF EXISTS "instructorType";

-- Add user_id column with unique + FK to User
ALTER TABLE "StaffMember" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "StaffMember_user_id_key" ON "StaffMember"("user_id");
ALTER TABLE "StaffMember"
  ADD CONSTRAINT "StaffMember_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
