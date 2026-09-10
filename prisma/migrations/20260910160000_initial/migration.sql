-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "companyId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'France',
    "taxNumber" TEXT,
    "notes" TEXT,
    "salespersonId" UUID,
    "creditLimitMinor" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "bankDetails" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalespersonProfile" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "commissionPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalespersonProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CASH',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "responsibleId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "salespersonId" UUID,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'INVOICED',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "saleId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "salespersonId" UUID,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "method" TEXT NOT NULL,
    "cashAccountId" UUID,
    "salespersonId" UUID,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "createdById" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "requesterId" UUID NOT NULL,
    "supplierId" UUID,
    "categoryId" UUID,
    "description" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "cashAccountId" UUID,
    "comment" TEXT,
    "approverId" UUID,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "sourceCashAccountId" UUID,
    "destinationCashAccountId" UUID,
    "sourceSalespersonId" UUID,
    "destinationSalespersonId" UUID,
    "clientId" UUID,
    "supplierId" UUID,
    "invoiceId" UUID,
    "expenseId" UUID,
    "paymentId" UUID,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "validatedById" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "comment" TEXT,
    "reference" TEXT,
    "reversalOfId" UUID,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransfer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceCashAccountId" UUID NOT NULL,
    "destinationCashAccountId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "transactionId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalespersonCashHandover" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "salespersonId" UUID NOT NULL,
    "cashAccountId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "transactionId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalespersonCashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "companyId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("companyId","type","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_active_idx" ON "User"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_id_key" ON "User"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_name_key" ON "Role"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_id_key" ON "Role"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Client_companyId_name_idx" ON "Client"("companyId", "name");

-- CreateIndex
CREATE INDEX "Client_companyId_salespersonId_idx" ON "Client"("companyId", "salespersonId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_id_key" ON "Client"("companyId", "id");

-- CreateIndex
CREATE INDEX "Supplier_companyId_name_idx" ON "Supplier"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_id_key" ON "Supplier"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonProfile_userId_key" ON "SalespersonProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonProfile_companyId_id_key" ON "SalespersonProfile"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonProfile_companyId_userId_key" ON "SalespersonProfile"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_companyId_id_key" ON "CashAccount"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_companyId_name_key" ON "CashAccount"("companyId", "name");

-- CreateIndex
CREATE INDEX "Sale_companyId_date_idx" ON "Sale"("companyId", "date");

-- CreateIndex
CREATE INDEX "Sale_companyId_salespersonId_idx" ON "Sale"("companyId", "salespersonId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_id_key" ON "Sale"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_number_key" ON "Sale"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_idempotencyKey_key" ON "Sale"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SaleLine_companyId_saleId_idx" ON "SaleLine"("companyId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_saleId_key" ON "Invoice"("saleId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_dueDate_idx" ON "Invoice"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_salespersonId_idx" ON "Invoice"("companyId", "salespersonId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_id_key" ON "Invoice"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_saleId_key" ON "Invoice"("companyId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_companyId_invoiceId_idx" ON "InvoiceLine"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "Payment_companyId_date_idx" ON "Payment"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_id_key" ON "Payment"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_number_key" ON "Payment"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_idempotencyKey_key" ON "Payment"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_id_key" ON "ExpenseCategory"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_name_key" ON "ExpenseCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "Expense_companyId_status_date_idx" ON "Expense"("companyId", "status", "date");

-- CreateIndex
CREATE INDEX "Expense_companyId_requesterId_idx" ON "Expense"("companyId", "requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_companyId_id_key" ON "Expense"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_companyId_number_key" ON "Expense"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_companyId_idempotencyKey_key" ON "Expense"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reversalOfId_key" ON "FinancialTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_date_idx" ON "FinancialTransaction"("companyId", "date");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_sourceCashAccountId_idx" ON "FinancialTransaction"("companyId", "sourceCashAccountId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_destinationCashAccountId_idx" ON "FinancialTransaction"("companyId", "destinationCashAccountId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_sourceSalespersonId_idx" ON "FinancialTransaction"("companyId", "sourceSalespersonId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_destinationSalespersonId_idx" ON "FinancialTransaction"("companyId", "destinationSalespersonId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_companyId_id_key" ON "FinancialTransaction"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_companyId_number_key" ON "FinancialTransaction"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_companyId_idempotencyKey_key" ON "FinancialTransaction"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransfer_transactionId_key" ON "CashTransfer"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransfer_companyId_id_key" ON "CashTransfer"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransfer_companyId_idempotencyKey_key" ON "CashTransfer"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonCashHandover_transactionId_key" ON "SalespersonCashHandover"("transactionId");

-- CreateIndex
CREATE INDEX "SalespersonCashHandover_companyId_salespersonId_idx" ON "SalespersonCashHandover"("companyId", "salespersonId");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonCashHandover_companyId_id_key" ON "SalespersonCashHandover"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonCashHandover_companyId_idempotencyKey_key" ON "SalespersonCashHandover"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_companyId_entity_entityId_idx" ON "Attachment"("companyId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_readAt_idx" ON "Notification"("companyId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entity_entityId_idx" ON "AuditLog"("companyId", "entity", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "Role"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "Role"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_salespersonId_fkey" FOREIGN KEY ("companyId", "salespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalespersonProfile" ADD CONSTRAINT "SalespersonProfile_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_companyId_responsibleId_fkey" FOREIGN KEY ("companyId", "responsibleId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_clientId_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_salespersonId_fkey" FOREIGN KEY ("companyId", "salespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "Sale"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "Sale"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_clientId_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_salespersonId_fkey" FOREIGN KEY ("companyId", "salespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "Invoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "Invoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_clientId_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_cashAccountId_fkey" FOREIGN KEY ("companyId", "cashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_salespersonId_fkey" FOREIGN KEY ("companyId", "salespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_requesterId_fkey" FOREIGN KEY ("companyId", "requesterId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "ExpenseCategory"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_cashAccountId_fkey" FOREIGN KEY ("companyId", "cashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_approverId_fkey" FOREIGN KEY ("companyId", "approverId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_companyId_clientId_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "Invoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_companyId_expenseId_fkey" FOREIGN KEY ("companyId", "expenseId") REFERENCES "Expense"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_companyId_createdById_fkey" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_companyId_validatedById_fkey" FOREIGN KEY ("companyId", "validatedById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
