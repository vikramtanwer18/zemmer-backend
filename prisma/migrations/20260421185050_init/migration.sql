-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'TRAINER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CHURNED');

-- CreateEnum
CREATE TYPE "MshipStatus" AS ENUM ('ACTIVE', 'FROZEN', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'TRIAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHERS');

-- CreateEnum
CREATE TYPE "InstructorType" AS ENUM ('TRAINER', 'COACH');

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "checked_in" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "method" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gym" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT,
    "plan" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "noOfBranches" INTEGER NOT NULL,
    "noOfMembers" INTEGER NOT NULL,
    "saasPlanId" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "grace_days" INTEGER NOT NULL DEFAULT 3,
    "razorpay_order_id" TEXT,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "stage" "LeadStage" NOT NULL,
    "owner_user_id" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "dob" TIMESTAMP(3),
    "gender" "Sex" NOT NULL,
    "joined_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "MshipStatus" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipFreeze" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "from_date" TIMESTAMP(3) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "MembershipFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "razorpay_payment_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "description" TEXT,
    "max_freeze_days" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaasPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPricePaise" INTEGER NOT NULL,
    "annualPricePaise" INTEGER NOT NULL,
    "maxMembers" INTEGER NOT NULL,
    "maxStaffUsers" INTEGER NOT NULL,
    "maxClassesPerMonth" INTEGER NOT NULL,
    "featureFlags" JSONB NOT NULL,
    "rzpPlanIdMonthly" TEXT,
    "rzpPlanIdAnnual" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaasPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "instructorType" "InstructorType" NOT NULL,
    "hourlyPrice" INTEGER NOT NULL,
    "bio" TEXT,
    "certificate" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL,
    "otp" TEXT,
    "expiresAt" TIMESTAMP(3),
    "role" "Role" NOT NULL,
    "refreshTokens" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_nonce_key" ON "Attendance"("nonce");

-- CreateIndex
CREATE INDEX "Booking_gym_id_status_idx" ON "Booking"("gym_id", "status");

-- CreateIndex
CREATE INDEX "Booking_member_id_idx" ON "Booking"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_class_id_member_id_key" ON "Booking"("class_id", "member_id");

-- CreateIndex
CREATE INDEX "Class_gym_id_starts_at_idx" ON "Class"("gym_id", "starts_at");

-- CreateIndex
CREATE INDEX "Class_trainer_id_idx" ON "Class"("trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Gym_subdomain_key" ON "Gym"("subdomain");

-- CreateIndex
CREATE INDEX "Gym_saasPlanId_idx" ON "Gym"("saasPlanId");

-- CreateIndex
CREATE INDEX "Member_gym_id_phone_idx" ON "Member"("gym_id", "phone");

-- CreateIndex
CREATE INDEX "Membership_gym_id_end_date_idx" ON "Membership"("gym_id", "end_date");

-- CreateIndex
CREATE INDEX "Membership_member_id_idx" ON "Membership"("member_id");

-- CreateIndex
CREATE INDEX "Membership_plan_id_idx" ON "Membership"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpay_payment_id_key" ON "Payment"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "Plan_gym_id_idx" ON "Plan"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_gym_id_name_key" ON "Plan"("gym_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SaasPlan_key_key" ON "SaasPlan"("key");

-- CreateIndex
CREATE INDEX "StaffMember_gym_id_idx" ON "StaffMember"("gym_id");

-- CreateIndex
CREATE INDEX "StaffMember_gym_id_phone_idx" ON "StaffMember"("gym_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_gym_id_email_key" ON "StaffMember"("gym_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_otp_key" ON "User"("otp");

-- CreateIndex
CREATE UNIQUE INDEX "User_gym_id_email_key" ON "User"("gym_id", "email");

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gym" ADD CONSTRAINT "Gym_saasPlanId_fkey" FOREIGN KEY ("saasPlanId") REFERENCES "SaasPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFreeze" ADD CONSTRAINT "MembershipFreeze_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
