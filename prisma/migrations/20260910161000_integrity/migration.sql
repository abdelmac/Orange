-- Tenant foreign keys also cover models whose Prisma API exposes only scalar IDs.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Role','Client','Supplier','SalespersonProfile','CashAccount','Sale','SaleLine','Invoice','InvoiceLine','Payment','ExpenseCategory','Expense','FinancialTransaction','CashTransfer','SalespersonCashHandover','Attachment','Notification','AuditLog','DocumentSequence','PasswordResetToken']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT', table_name, table_name || '_company_tenant_fk');
  END LOOP;
END $$;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenant_user_fk" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploader_fk" FOREIGN KEY ("companyId", "uploadedById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_fk" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_fk" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_creator_fk" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creator_fk" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_creator_fk" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT;

ALTER TABLE "FinancialTransaction"
  ADD CONSTRAINT "FT_source_cash_tenant_fk" FOREIGN KEY ("companyId", "sourceCashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FT_destination_cash_tenant_fk" FOREIGN KEY ("companyId", "destinationCashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FT_source_person_tenant_fk" FOREIGN KEY ("companyId", "sourceSalespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FT_destination_person_tenant_fk" FOREIGN KEY ("companyId", "destinationSalespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FT_payment_tenant_fk" FOREIGN KEY ("companyId", "paymentId") REFERENCES "Payment"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FT_reversal_tenant_fk" FOREIGN KEY ("companyId", "reversalOfId") REFERENCES "FinancialTransaction"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FT_positive_amount" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "FT_validated" CHECK (status = 'VALIDATED'),
  ADD CONSTRAINT "FT_type" CHECK (type IN ('PAYMENT','EXPENSE','TRANSFER','HANDOVER','ADJUSTMENT','REVERSAL')),
  ADD CONSTRAINT "FT_single_source" CHECK (num_nonnulls("sourceCashAccountId", "sourceSalespersonId") <= 1),
  ADD CONSTRAINT "FT_single_destination" CHECK (num_nonnulls("destinationCashAccountId", "destinationSalespersonId") <= 1),
  ADD CONSTRAINT "FT_has_endpoint" CHECK (num_nonnulls("sourceCashAccountId", "sourceSalespersonId", "destinationCashAccountId", "destinationSalespersonId") > 0),
  ADD CONSTRAINT "FT_different_cash" CHECK ("sourceCashAccountId" IS NULL OR "destinationCashAccountId" IS NULL OR "sourceCashAccountId" <> "destinationCashAccountId"),
  ADD CONSTRAINT "FT_reversal_link" CHECK ((type = 'REVERSAL') = ("reversalOfId" IS NOT NULL)),
  ADD CONSTRAINT "FT_transfer_endpoints" CHECK (type <> 'TRANSFER' OR ("sourceCashAccountId" IS NOT NULL AND "destinationCashAccountId" IS NOT NULL)),
  ADD CONSTRAINT "FT_handover_endpoints" CHECK (type <> 'HANDOVER' OR ("sourceSalespersonId" IS NOT NULL AND "destinationCashAccountId" IS NOT NULL)),
  ADD CONSTRAINT "FT_payment_endpoints" CHECK (type <> 'PAYMENT' OR ("paymentId" IS NOT NULL AND "invoiceId" IS NOT NULL AND num_nonnulls("destinationCashAccountId", "destinationSalespersonId") = 1 AND num_nonnulls("sourceCashAccountId", "sourceSalespersonId") = 0)),
  ADD CONSTRAINT "FT_expense_endpoints" CHECK (type <> 'EXPENSE' OR ("expenseId" IS NOT NULL AND "sourceCashAccountId" IS NOT NULL AND num_nonnulls("destinationCashAccountId", "destinationSalespersonId") = 0));

ALTER TABLE "CashTransfer"
  ADD CONSTRAINT "CashTransfer_source_fk" FOREIGN KEY ("companyId", "sourceCashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "CashTransfer_destination_fk" FOREIGN KEY ("companyId", "destinationCashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "CashTransfer_creator_fk" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "CashTransfer_transaction_fk" FOREIGN KEY ("companyId", "transactionId") REFERENCES "FinancialTransaction"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "CashTransfer_positive" CHECK ("amountMinor" > 0 AND "sourceCashAccountId" <> "destinationCashAccountId");
ALTER TABLE "SalespersonCashHandover"
  ADD CONSTRAINT "Handover_person_fk" FOREIGN KEY ("companyId", "salespersonId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "Handover_cash_fk" FOREIGN KEY ("companyId", "cashAccountId") REFERENCES "CashAccount"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "Handover_creator_fk" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "Handover_transaction_fk" FOREIGN KEY ("companyId", "transactionId") REFERENCES "FinancialTransaction"("companyId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "Handover_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Payment_destination" CHECK (num_nonnulls("cashAccountId", "salespersonId") = 1),
  ADD CONSTRAINT "Payment_status" CHECK (status IN ('VALIDATED','REVERSED')),
  ADD CONSTRAINT "Payment_method" CHECK (method IN ('CASH','CARD','TRANSFER','CHECK','OTHER'));
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Expense_status" CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAID')),
  ADD CONSTRAINT "Expense_approval" CHECK (status NOT IN ('APPROVED','PAID') OR ("approverId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  ADD CONSTRAINT "Expense_payment" CHECK (status <> 'PAID' OR ("paidAt" IS NOT NULL AND "cashAccountId" IS NOT NULL));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts" CHECK ("totalMinor" > 0 AND "paidMinor" >= 0 AND "paidMinor" <= "totalMinor" AND "totalMinor" = "subtotalMinor" - "discountMinor" + "taxMinor");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_amounts" CHECK ("totalMinor" > 0 AND "totalMinor" = "subtotalMinor" - "discountMinor" + "taxMinor");
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_amounts" CHECK (quantity > 0 AND "unitPrice" >= 0 AND "discountPercent" BETWEEN 0 AND 100 AND "taxPercent" BETWEEN 0 AND 100 AND "totalMinor" = "subtotalMinor" - "discountMinor" + "taxMinor");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_amounts" CHECK (quantity > 0 AND "unitPrice" >= 0 AND "discountPercent" BETWEEN 0 AND 100 AND "taxPercent" BETWEEN 0 AND 100 AND "totalMinor" = "subtotalMinor" - "discountMinor" + "taxMinor");
ALTER TABLE "SalespersonProfile" ADD CONSTRAINT "Commission_bounds" CHECK ("commissionPercent" BETWEEN 0 AND 100);
ALTER TABLE "Client" ADD CONSTRAINT "Client_credit_nonnegative" CHECK ("creditLimitMinor" >= 0);

CREATE FUNCTION orange_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable financial or audit record: use a reversal instead' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER financial_transaction_immutable BEFORE UPDATE OR DELETE ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION orange_immutable();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION orange_immutable();
CREATE TRIGGER cash_transfer_immutable BEFORE UPDATE OR DELETE ON "CashTransfer" FOR EACH ROW EXECUTE FUNCTION orange_immutable();
CREATE TRIGGER handover_immutable BEFORE UPDATE OR DELETE ON "SalespersonCashHandover" FOR EACH ROW EXECUTE FUNCTION orange_immutable();
CREATE TRIGGER invoice_line_immutable BEFORE UPDATE OR DELETE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION orange_immutable();
CREATE TRIGGER sale_line_immutable BEFORE UPDATE OR DELETE ON "SaleLine" FOR EACH ROW EXECUTE FUNCTION orange_immutable();

CREATE FUNCTION orange_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued documents cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','paidMinor','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','paidMinor','updatedAt']) THEN
    RAISE EXCEPTION 'Issued document fields are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_document_immutable BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION orange_document_immutable();
CREATE TRIGGER sale_document_immutable BEFORE UPDATE OR DELETE ON "Sale" FOR EACH ROW EXECUTE FUNCTION orange_document_immutable();
CREATE TRIGGER payment_document_immutable BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION orange_document_immutable();

CREATE FUNCTION orange_validate_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "FinancialTransaction";
BEGIN
  IF NEW.type = 'REVERSAL' THEN
    SELECT * INTO original FROM "FinancialTransaction" WHERE id = NEW."reversalOfId" AND "companyId" = NEW."companyId";
    IF original.id IS NULL OR original.type = 'REVERSAL' OR original."amountMinor" <> NEW."amountMinor" OR original.currency <> NEW.currency
      OR original."sourceCashAccountId" IS DISTINCT FROM NEW."destinationCashAccountId"
      OR original."destinationCashAccountId" IS DISTINCT FROM NEW."sourceCashAccountId"
      OR original."sourceSalespersonId" IS DISTINCT FROM NEW."destinationSalespersonId"
      OR original."destinationSalespersonId" IS DISTINCT FROM NEW."sourceSalespersonId"
      OR original."paymentId" IS DISTINCT FROM NEW."paymentId"
      OR original."invoiceId" IS DISTINCT FROM NEW."invoiceId"
      OR original."expenseId" IS DISTINCT FROM NEW."expenseId" THEN
      RAISE EXCEPTION 'Reversal must exactly reverse the original transaction' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_transaction_reversal BEFORE INSERT ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION orange_validate_reversal();
