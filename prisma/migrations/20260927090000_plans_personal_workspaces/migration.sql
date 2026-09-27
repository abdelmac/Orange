BEGIN;
-- CreateEnum
CREATE TYPE "AccountUsageType" AS ENUM ('BUSINESS', 'PERSONAL', 'BOTH');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonalCategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PersonalTransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_companyId_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_companyId_userId_fkey";

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_companyId_salespersonId_fkey";

-- DropForeignKey
ALTER TABLE "SalespersonProfile" DROP CONSTRAINT "SalespersonProfile_companyId_userId_fkey";

-- DropForeignKey
ALTER TABLE "CashAccount" DROP CONSTRAINT "CashAccount_companyId_responsibleId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_companyId_salespersonId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_companyId_salespersonId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_companyId_salespersonId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_companyId_requesterId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_companyId_approverId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_companyId_createdById_fkey";

-- DropForeignKey
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_companyId_validatedById_fkey";

-- DropForeignKey
ALTER TABLE "TransactionReceipt" DROP CONSTRAINT "TransactionReceipt_companyId_issuedById_fkey";

-- DropIndex
DROP INDEX "SalespersonProfile_userId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "personalCurrency" CHAR(3) NOT NULL DEFAULT 'EUR',
ADD COLUMN     "usageType" "AccountUsageType" NOT NULL DEFAULT 'BUSINESS',
ALTER COLUMN "companyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "companyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PasswordResetToken" ALTER COLUMN "companyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customizationSnapshot" JSONB;

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateTable
CREATE TABLE "MembershipPermission" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("companyId","userId","permissionKey")
);

-- CreateTable
CREATE TABLE "TeamInvitation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "invitedById" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "monthlyPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "userId" UUID,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "externalSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "checkoutSessionId" TEXT,
    "checkoutExpiresAt" TIMESTAMPTZ(3),
    "checkoutAttempt" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCustomization" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "logoData" BYTEA,
    "logoMime" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InvoiceCustomization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CURRENT',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "initialBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PersonalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalCategory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PersonalCategoryType" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#cf5426',

    CONSTRAINT "PersonalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAttachment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "destinationAccountId" UUID,
    "type" "PersonalTransactionType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "categoryId" UUID,
    "description" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "attachmentId" UUID,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PersonalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalBudget" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "limitMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "PersonalBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyMembership_userId_active_idx" ON "CompanyMembership"("userId", "active");

-- CreateIndex
CREATE INDEX "MembershipPermission_permissionKey_idx" ON "MembershipPermission"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TeamInvitation_companyId_status_email_idx" ON "TeamInvitation"("companyId", "status", "email");

-- CreateIndex
CREATE INDEX "TeamInvitation_companyId_roleId_idx" ON "TeamInvitation"("companyId", "roleId");

-- CreateIndex
CREATE INDEX "TeamInvitation_invitedById_idx" ON "TeamInvitation"("invitedById");

-- CreateIndex
CREATE INDEX "TeamInvitation_expiresAt_idx" ON "TeamInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_checkoutSessionId_key" ON "Subscription"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceCustomization_companyId_key" ON "InvoiceCustomization"("companyId");

-- CreateIndex
CREATE INDEX "PersonalAccount_userId_isArchived_idx" ON "PersonalAccount"("userId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccount_userId_id_key" ON "PersonalAccount"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalCategory_userId_id_key" ON "PersonalCategory"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalCategory_userId_type_name_key" ON "PersonalCategory"("userId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAttachment_storageKey_key" ON "PersonalAttachment"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAttachment_userId_id_key" ON "PersonalAttachment"("userId", "id");

-- CreateIndex
CREATE INDEX "PersonalTransaction_userId_date_idx" ON "PersonalTransaction"("userId", "date");

-- CreateIndex
CREATE INDEX "PersonalTransaction_userId_accountId_date_idx" ON "PersonalTransaction"("userId", "accountId", "date");

-- CreateIndex
CREATE INDEX "PersonalTransaction_userId_destinationAccountId_idx" ON "PersonalTransaction"("userId", "destinationAccountId");

-- CreateIndex
CREATE INDEX "PersonalTransaction_userId_categoryId_date_idx" ON "PersonalTransaction"("userId", "categoryId", "date");

-- CreateIndex
CREATE INDEX "PersonalTransaction_userId_attachmentId_idx" ON "PersonalTransaction"("userId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalTransaction_userId_id_key" ON "PersonalTransaction"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalTransaction_userId_idempotencyKey_key" ON "PersonalTransaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PersonalBudget_userId_year_month_idx" ON "PersonalBudget"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalBudget_userId_categoryId_month_year_currency_key" ON "PersonalBudget"("userId", "categoryId", "month", "year", "currency");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalespersonProfile" ADD CONSTRAINT "SalespersonProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionReceipt" ADD CONSTRAINT "TransactionReceipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "CompanyMembership"("companyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "Role"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceCustomization" ADD CONSTRAINT "InvoiceCustomization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAccount" ADD CONSTRAINT "PersonalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalCategory" ADD CONSTRAINT "PersonalCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAttachment" ADD CONSTRAINT "PersonalAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTransaction" ADD CONSTRAINT "PersonalTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTransaction" ADD CONSTRAINT "PersonalTransaction_userId_accountId_fkey" FOREIGN KEY ("userId", "accountId") REFERENCES "PersonalAccount"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTransaction" ADD CONSTRAINT "PersonalTransaction_userId_destinationAccountId_fkey" FOREIGN KEY ("userId", "destinationAccountId") REFERENCES "PersonalAccount"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTransaction" ADD CONSTRAINT "PersonalTransaction_userId_categoryId_fkey" FOREIGN KEY ("userId", "categoryId") REFERENCES "PersonalCategory"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTransaction" ADD CONSTRAINT "PersonalTransaction_userId_attachmentId_fkey" FOREIGN KEY ("userId", "attachmentId") REFERENCES "PersonalAttachment"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalBudget" ADD CONSTRAINT "PersonalBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalBudget" ADD CONSTRAINT "PersonalBudget_userId_categoryId_fkey" FOREIGN KEY ("userId", "categoryId") REFERENCES "PersonalCategory"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve every existing company membership before retargeting tenant foreign keys.
INSERT INTO "CompanyMembership" ("companyId", "userId", active, "createdAt")
SELECT "companyId", id, active, "createdAt" FROM "User" WHERE "companyId" IS NOT NULL;
WITH owners AS (
  SELECT DISTINCT ON (m."companyId") m."companyId", m."userId"
  FROM "CompanyMembership" m JOIN "User" u ON u.id=m."userId"
  JOIN "UserRole" ur ON ur."companyId"=m."companyId" AND ur."userId"=m."userId"
  JOIN "Role" r ON r.id=ur."roleId"
  WHERE r.name='ADMIN' AND m.active
  ORDER BY m."companyId", u."createdAt", u.id
) UPDATE "CompanyMembership" m SET "isOwner"=true FROM owners o
WHERE m."companyId"=o."companyId" AND m."userId"=o."userId";
CREATE UNIQUE INDEX "CompanyMembership_one_owner" ON "CompanyMembership"("companyId") WHERE "isOwner";

-- Remaining hand-written legacy constraints referenced the old home company.
DO $$ DECLARE fk record; BEGIN
 FOR fk IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
 WHERE contype='f' AND confrelid='"User"'::regclass AND cardinality(conkey)=2 LOOP
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.tbl,fk.conname);
 END LOOP;
END $$;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_membership_fk" FOREIGN KEY ("companyId","userId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_membership_fk" FOREIGN KEY ("companyId","userId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_salespersonId_membership_fk" FOREIGN KEY ("companyId","salespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "SalespersonProfile" ADD CONSTRAINT "SalespersonProfile_userId_membership_fk" FOREIGN KEY ("companyId","userId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_responsibleId_membership_fk" FOREIGN KEY ("companyId","responsibleId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salespersonId_membership_fk" FOREIGN KEY ("companyId","salespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salespersonId_membership_fk" FOREIGN KEY ("companyId","salespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salespersonId_membership_fk" FOREIGN KEY ("companyId","salespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_requesterId_membership_fk" FOREIGN KEY ("companyId","requesterId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approverId_membership_fk" FOREIGN KEY ("companyId","approverId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_createdById_membership_fk" FOREIGN KEY ("companyId","createdById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_validatedById_membership_fk" FOREIGN KEY ("companyId","validatedById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "TransactionReceipt" ADD CONSTRAINT "TransactionReceipt_issuedById_membership_fk" FOREIGN KEY ("companyId","issuedById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_membership_fk" FOREIGN KEY ("companyId","userId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_membership_fk" FOREIGN KEY ("companyId","uploadedById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_membership_fk" FOREIGN KEY ("companyId","userId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_membership_fk" FOREIGN KEY ("companyId","userId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_membership_fk" FOREIGN KEY ("companyId","createdById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_membership_fk" FOREIGN KEY ("companyId","createdById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_membership_fk" FOREIGN KEY ("companyId","createdById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_sourceSalespersonId_membership_fk" FOREIGN KEY ("companyId","sourceSalespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_destinationSalespersonId_membership_fk" FOREIGN KEY ("companyId","destinationSalespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_createdById_membership_fk" FOREIGN KEY ("companyId","createdById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "SalespersonCashHandover" ADD CONSTRAINT "SalespersonCashHandover_salespersonId_membership_fk" FOREIGN KEY ("companyId","salespersonId") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "SalespersonCashHandover" ADD CONSTRAINT "SalespersonCashHandover_createdById_membership_fk" FOREIGN KEY ("companyId","createdById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_invitedById_membership_fk" FOREIGN KEY ("companyId","invitedById") REFERENCES "CompanyMembership"("companyId","userId") ON DELETE RESTRICT;

-- Compatibility for CLI/seed provisioning with an explicit home company.
CREATE FUNCTION orange_initial_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."companyId" IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtext(NEW."companyId"::text));
   INSERT INTO "CompanyMembership" ("companyId","userId",active,"isOwner")
   VALUES (NEW."companyId",NEW.id,NEW.active,NOT EXISTS(SELECT 1 FROM "CompanyMembership" WHERE "companyId"=NEW."companyId"))
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_initial_membership AFTER INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION orange_initial_membership();

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_exact_owner" CHECK (num_nonnulls("companyId","userId")=1);
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_positive_price" CHECK ("monthlyPriceMinor">=0);
ALTER TABLE "PersonalTransaction" ADD CONSTRAINT "PersonalTransaction_positive" CHECK ("amountMinor">0),
 ADD CONSTRAINT "PersonalTransaction_transfer_endpoints" CHECK ((type='TRANSFER')=("destinationAccountId" IS NOT NULL) AND "accountId" IS DISTINCT FROM "destinationAccountId"),
 ADD CONSTRAINT "PersonalTransaction_transfer_category" CHECK (type<>'TRANSFER' OR "categoryId" IS NULL);
ALTER TABLE "PersonalBudget" ADD CONSTRAINT "PersonalBudget_bounds" CHECK (month BETWEEN 1 AND 12 AND year BETWEEN 2000 AND 9999 AND "limitMinor">0);
ALTER TABLE "PersonalAttachment" ADD CONSTRAINT "PersonalAttachment_size" CHECK (size>0 AND size<=10485760);
ALTER TABLE "InvoiceCustomization" ADD CONSTRAINT "InvoiceCustomization_logo" CHECK (("logoData" IS NULL AND "logoMime" IS NULL) OR (octet_length("logoData") BETWEEN 1 AND 1048576 AND "logoMime" IN ('image/png','image/jpeg')));
CREATE UNIQUE INDEX "TeamInvitation_one_pending_email" ON "TeamInvitation"("companyId",email) WHERE status='PENDING';
INSERT INTO "SubscriptionPlan" (id,name,code,"monthlyPriceMinor",currency,features,"updatedAt") VALUES (gen_random_uuid(),'FREE','FREE',0,'EUR','["clients", "invoices", "expenses", "incomes", "dashboard", "invoice_pdf"]'::jsonb,CURRENT_TIMESTAMP);
INSERT INTO "SubscriptionPlan" (id,name,code,"monthlyPriceMinor",currency,features,"updatedAt") VALUES (gen_random_uuid(),'PRO','PRO',400,'EUR','["clients", "invoices", "expenses", "incomes", "dashboard", "invoice_pdf", "invoice_customization", "remove_branding", "teams", "advanced_reports"]'::jsonb,CURRENT_TIMESTAMP);
INSERT INTO "SubscriptionPlan" (id,name,code,"monthlyPriceMinor",currency,features,"updatedAt") VALUES (gen_random_uuid(),'Accès existant','LEGACY',0,'EUR','["clients", "invoices", "expenses", "incomes", "dashboard", "invoice_pdf", "teams", "advanced_reports"]'::jsonb,CURRENT_TIMESTAMP);

-- Existing businesses retain their original features; new registrations start on FREE.
INSERT INTO "Subscription" (id,"companyId","planId",status,"updatedAt")
SELECT gen_random_uuid(),c.id,p.id,'FREE',CURRENT_TIMESTAMP FROM "Company" c CROSS JOIN "SubscriptionPlan" p WHERE p.code='LEGACY';

COMMIT;
