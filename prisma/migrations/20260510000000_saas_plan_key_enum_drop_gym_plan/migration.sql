-- Create SaasPlanKey enum
CREATE TYPE "SaasPlanKey" AS ENUM ('TRIAL', 'PRO', 'ELITE');

-- Convert SaasPlan.key from String to SaasPlanKey enum
-- Existing SaasPlan rows must have key values that match enum members ('TRIAL', 'PRO', 'ELITE');
-- if there were stale values they would need to be normalised before this runs.
ALTER TABLE "SaasPlan" ALTER COLUMN "key" TYPE "SaasPlanKey" USING "key"::"SaasPlanKey";

-- Drop redundant Gym.plan column (replaced by saasPlanId FK to SaasPlan)
ALTER TABLE "Gym" DROP COLUMN IF EXISTS "plan";
