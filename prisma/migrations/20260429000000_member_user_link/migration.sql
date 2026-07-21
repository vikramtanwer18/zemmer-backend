-- Add MEMBER to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEMBER';

-- Add user_id column to Member with unique + FK
ALTER TABLE "Member" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "Member_user_id_key" ON "Member"("user_id");
ALTER TABLE "Member"
  ADD CONSTRAINT "Member_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
