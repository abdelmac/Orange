-- Approved amounts cannot change under an existing approval. A paid expense is
-- reopened only by its accounting reversal; the service does both atomically.
CREATE OR REPLACE FUNCTION orange_expense_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status NOT IN ('DRAFT','PENDING') THEN
    RAISE EXCEPTION 'An examined expense cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."companyId" <> OLD."companyId" OR NEW."requesterId" <> OLD."requesterId" OR NEW.number <> OLD.number THEN
      RAISE EXCEPTION 'Expense ownership is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('APPROVED','REJECTED','PAID') AND
      (to_jsonb(NEW) - ARRAY['status','paidAt','cashAccountId','method','updatedAt']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status','paidAt','cashAccountId','method','updatedAt']) THEN
      RAISE EXCEPTION 'Reviewed expense fields are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'REJECTED' AND NEW.status <> 'REJECTED' THEN
      RAISE EXCEPTION 'Rejected expense cannot be paid or reopened' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('APPROVED','PAID') AND NEW.status NOT IN ('APPROVED','PAID') THEN
      RAISE EXCEPTION 'Approved expense has an invalid transition' USING ERRCODE = '23514';
    END IF;
    IF OLD."cashAccountId" IS NOT NULL AND OLD.status IN ('APPROVED','PAID') AND NEW."cashAccountId" IS DISTINCT FROM OLD."cashAccountId" THEN
      RAISE EXCEPTION 'Approved expense cash assignment is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS expense_review_integrity ON "Expense";
CREATE TRIGGER expense_review_integrity BEFORE UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION orange_expense_integrity();

-- Check final transaction state at COMMIT, so intermediate writes within one
-- atomic payment/reversal are allowed but inconsistent commits are rejected.
CREATE FUNCTION orange_check_financial_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_id uuid; payment_id uuid; expense_id uuid;
  invoice_row "Invoice"; payment_row "Payment"; expense_row "Expense";
  paid bigint; net bigint;
BEGIN
  IF TG_TABLE_NAME = 'Invoice' THEN invoice_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'Payment' THEN payment_id := NEW.id; invoice_id := NEW."invoiceId";
  ELSIF TG_TABLE_NAME = 'Expense' THEN expense_id := NEW.id;
  ELSE payment_id := NEW."paymentId"; invoice_id := NEW."invoiceId"; expense_id := NEW."expenseId";
  END IF;
  IF invoice_id IS NOT NULL THEN
    SELECT * INTO invoice_row FROM "Invoice" WHERE id = invoice_id;
    SELECT COALESCE(SUM("amountMinor"),0) INTO paid FROM "Payment" WHERE "invoiceId" = invoice_id AND status = 'VALIDATED';
    IF invoice_row."paidMinor" <> paid OR
       (paid = invoice_row."totalMinor" AND invoice_row.status <> 'PAID') OR
       (paid > 0 AND paid < invoice_row."totalMinor" AND invoice_row.status <> 'PARTIALLY_PAID') OR
       (paid = 0 AND invoice_row.status NOT IN ('DRAFT','ISSUED','CANCELLED')) THEN
      RAISE EXCEPTION 'Invoice state does not match validated payments' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF payment_id IS NOT NULL THEN
    SELECT * INTO payment_row FROM "Payment" WHERE id = payment_id;
    SELECT COALESCE(SUM(CASE WHEN type = 'REVERSAL' THEN -"amountMinor" ELSE "amountMinor" END),0) INTO net
      FROM "FinancialTransaction" WHERE "paymentId" = payment_id;
    IF net <> (CASE WHEN payment_row.status = 'VALIDATED' THEN payment_row."amountMinor" ELSE 0 END) THEN
      RAISE EXCEPTION 'Payment state does not match immutable ledger' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF expense_id IS NOT NULL THEN
    SELECT * INTO expense_row FROM "Expense" WHERE id = expense_id;
    SELECT COALESCE(SUM(CASE WHEN type = 'REVERSAL' THEN -"amountMinor" ELSE "amountMinor" END),0) INTO net
      FROM "FinancialTransaction" WHERE "expenseId" = expense_id;
    IF net <> (CASE WHEN expense_row.status = 'PAID' THEN expense_row."amountMinor" ELSE 0 END) THEN
      RAISE EXCEPTION 'Expense state does not match immutable ledger' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER invoice_state_consistency AFTER INSERT OR UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orange_check_financial_state();
CREATE CONSTRAINT TRIGGER payment_state_consistency AFTER INSERT OR UPDATE ON "Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orange_check_financial_state();
CREATE CONSTRAINT TRIGGER expense_state_consistency AFTER INSERT OR UPDATE ON "Expense" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orange_check_financial_state();
CREATE CONSTRAINT TRIGGER ledger_state_consistency AFTER INSERT ON "FinancialTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION orange_check_financial_state();
