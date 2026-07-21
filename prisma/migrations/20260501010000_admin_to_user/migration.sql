-- Make User.gym_id nullable so platform-level admins can live in User
ALTER TABLE "User" ALTER COLUMN "gym_id" DROP NOT NULL;

-- Migrate existing admins (if any) into User with role=ADMIN, gym_id=NULL
INSERT INTO "User" (
    "id", "gym_id", "email", "password_hash", "isVerified",
    "otp", "expiresAt", "role", "refreshToken", "phone",
    "created_at", "updated_at"
)
SELECT
    "id",
    NULL,
    "email",
    "password_hash",
    true,
    NULL,
    NULL,
    'ADMIN',
    "refreshToken",
    NULL,
    "createdAt",
    "updatedAt"
FROM "Admin"
ON CONFLICT ("email") DO NOTHING;

-- Drop the legacy Admin table
DROP TABLE IF EXISTS "Admin";
