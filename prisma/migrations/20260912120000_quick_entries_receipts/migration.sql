ALTER TABLE "Expense"
  ADD COLUMN "beneficiaryName" TEXT,
  ADD COLUMN "beneficiaryKind" TEXT,
  ADD COLUMN "beneficiaryPhone" TEXT,
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "quickEntryFingerprint" CHAR(64),
  ADD CONSTRAINT "Expense_beneficiary_kind" CHECK ("beneficiaryKind" IS NULL OR "beneficiaryKind" IN ('CLIENT','DRIVER','SALESPERSON','EMPLOYEE','SUPPLIER','OTHER')),
  ADD CONSTRAINT "Expense_beneficiary_identity" CHECK (("beneficiaryName" IS NULL AND "beneficiaryKind" IS NULL AND "beneficiaryPhone" IS NULL) OR ("beneficiaryName" IS NOT NULL AND length(btrim("beneficiaryName")) BETWEEN 1 AND 200 AND "beneficiaryKind" IS NOT NULL)),
  ADD CONSTRAINT "Expense_beneficiary_phone" CHECK ("beneficiaryPhone" IS NULL OR length("beneficiaryPhone") <= 60),
  ADD CONSTRAINT "Expense_reference_length" CHECK ("reference" IS NULL OR length("reference") <= 300),
  ADD CONSTRAINT "Expense_quick_fingerprint" CHECK ("quickEntryFingerprint" IS NULL OR "quickEntryFingerprint" ~ '^[a-f0-9]{64}$');

CREATE TABLE "CashEntry" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "transactionId" UUID NOT NULL,
  "partyName" TEXT NOT NULL,
  "partyKind" TEXT NOT NULL,
  "phone" TEXT,
  "description" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashEntry_company_tenant_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashEntry_companyId_transactionId_fkey" FOREIGN KEY ("companyId", "transactionId") REFERENCES "FinancialTransaction"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashEntry_party_kind" CHECK ("partyKind" IN ('CLIENT','DRIVER','SALESPERSON','EMPLOYEE','SUPPLIER','OTHER')),
  CONSTRAINT "CashEntry_party_name" CHECK (length(btrim("partyName")) BETWEEN 1 AND 200),
  CONSTRAINT "CashEntry_description" CHECK (length(btrim("description")) BETWEEN 3 AND 5000),
  CONSTRAINT "CashEntry_phone" CHECK ("phone" IS NULL OR length("phone") <= 60),
  CONSTRAINT "CashEntry_method" CHECK ("method" IN ('CASH','CARD','TRANSFER','CHECK','OTHER'))
);
CREATE UNIQUE INDEX "CashEntry_transactionId_key" ON "CashEntry"("transactionId");
CREATE UNIQUE INDEX "CashEntry_companyId_id_key" ON "CashEntry"("companyId", "id");
CREATE UNIQUE INDEX "CashEntry_companyId_transactionId_key" ON "CashEntry"("companyId", "transactionId");
CREATE INDEX "CashEntry_companyId_partyName_idx" ON "CashEntry"("companyId", "partyName");
CREATE INDEX "CashEntry_companyId_createdAt_idx" ON "CashEntry"("companyId", "createdAt");

CREATE TABLE "TransactionReceipt" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "transactionId" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "issuedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransactionReceipt_company_tenant_fk" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransactionReceipt_companyId_transactionId_fkey" FOREIGN KEY ("companyId", "transactionId") REFERENCES "FinancialTransaction"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransactionReceipt_companyId_issuedById_fkey" FOREIGN KEY ("companyId", "issuedById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TransactionReceipt_number" CHECK (length(btrim("number")) BETWEEN 1 AND 100),
  CONSTRAINT "TransactionReceipt_snapshot_object" CHECK (jsonb_typeof("snapshot") = 'object')
);
CREATE UNIQUE INDEX "TransactionReceipt_transactionId_key" ON "TransactionReceipt"("transactionId");
CREATE UNIQUE INDEX "TransactionReceipt_companyId_id_key" ON "TransactionReceipt"("companyId", "id");
CREATE UNIQUE INDEX "TransactionReceipt_companyId_transactionId_key" ON "TransactionReceipt"("companyId", "transactionId");
CREATE UNIQUE INDEX "TransactionReceipt_companyId_number_key" ON "TransactionReceipt"("companyId", "number");
CREATE INDEX "TransactionReceipt_companyId_createdAt_idx" ON "TransactionReceipt"("companyId", "createdAt");

ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FT_type";
ALTER TABLE "FinancialTransaction"
  ADD CONSTRAINT "FT_type" CHECK (type IN ('PAYMENT','EXPENSE','TRANSFER','HANDOVER','ADJUSTMENT','REVERSAL','CASH_RECEIPT')),
  ADD CONSTRAINT "FT_cash_receipt_endpoints" CHECK (type <> 'CASH_RECEIPT' OR (
    num_nonnulls("destinationCashAccountId", "destinationSalespersonId") = 1
    AND num_nonnulls("sourceCashAccountId", "sourceSalespersonId") = 0
    AND num_nonnulls("invoiceId", "paymentId", "expenseId") = 0
  ));

CREATE TRIGGER cash_entry_immutable BEFORE UPDATE OR DELETE ON "CashEntry" FOR EACH ROW EXECUTE FUNCTION orange_immutable();
CREATE TRIGGER transaction_receipt_immutable BEFORE UPDATE OR DELETE ON "TransactionReceipt" FOR EACH ROW EXECUTE FUNCTION orange_immutable();

-- Defer the linkage check until COMMIT so the ledger movement and its identity
-- document can be inserted in either order within one atomic transaction.
CREATE FUNCTION orange_check_cash_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement_id uuid; movement_type text;
BEGIN
  IF TG_TABLE_NAME = 'CashEntry' THEN movement_id := NEW."transactionId";
  ELSE
    IF NEW.type <> 'CASH_RECEIPT' THEN RETURN NULL; END IF;
    movement_id := NEW.id;
  END IF;
  SELECT type INTO movement_type FROM "FinancialTransaction" WHERE id = movement_id;
  IF movement_type IS DISTINCT FROM 'CASH_RECEIPT' OR NOT EXISTS (SELECT 1 FROM "CashEntry" WHERE "transactionId" = movement_id) THEN
    RAISE EXCEPTION 'Cash receipt ledger entry requires its immutable counterparty record' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER cash_entry_ledger_consistency AFTER INSERT ON "CashEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orange_check_cash_entry();
CREATE CONSTRAINT TRIGGER ledger_cash_entry_consistency AFTER INSERT ON "FinancialTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orange_check_cash_entry();
