/*
  Warnings:

  - You are about to drop the column `owner_user_id` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `actor_user_id` on the `LeadActivity` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `source` on the `Lead` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `done_by` to the `LeadActivity` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WALK_IN', 'WEBSITE', 'INSTAGRAM', 'REFERRAL');

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "owner_user_id",
ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "source",
ADD COLUMN     "source" "LeadSource" NOT NULL,
ALTER COLUMN "stage" SET DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "LeadActivity" DROP COLUMN "actor_user_id",
ADD COLUMN     "done_by" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "lead_id" TEXT;

-- CreateTable
CREATE TABLE "LeadFollowup" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "followup_at" TIMESTAMP(3) NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadFollowup_gym_id_is_done_followup_at_idx" ON "LeadFollowup"("gym_id", "is_done", "followup_at");

-- CreateIndex
CREATE INDEX "LeadFollowup_lead_id_idx" ON "LeadFollowup"("lead_id");

-- CreateIndex
CREATE INDEX "Lead_gym_id_stage_idx" ON "Lead"("gym_id", "stage");

-- CreateIndex
CREATE INDEX "Lead_gym_id_phone_idx" ON "Lead"("gym_id", "phone");

-- CreateIndex
CREATE INDEX "Lead_assignedTo_idx" ON "Lead"("assignedTo");

-- CreateIndex
CREATE INDEX "LeadActivity_gym_id_lead_id_idx" ON "LeadActivity"("gym_id", "lead_id");

-- CreateIndex
CREATE INDEX "LeadActivity_lead_id_created_at_idx" ON "LeadActivity"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFollowup" ADD CONSTRAINT "LeadFollowup_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
