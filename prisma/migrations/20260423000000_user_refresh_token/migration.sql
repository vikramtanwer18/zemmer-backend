-- Rename User.refreshTokens to User.refreshToken and make it nullable.
ALTER TABLE "User" RENAME COLUMN "refreshTokens" TO "refreshToken";
ALTER TABLE "User" ALTER COLUMN "refreshToken" DROP NOT NULL;
UPDATE "User" SET "refreshToken" = NULL WHERE "refreshToken" = '';
