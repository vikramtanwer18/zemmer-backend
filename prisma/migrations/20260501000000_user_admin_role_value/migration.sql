-- Add ADMIN to Role enum (must be in its own migration; cannot be used in same transaction in Postgres)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';
