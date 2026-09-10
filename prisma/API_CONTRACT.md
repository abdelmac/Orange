# Contrat services financiers

`Actor` est exporté par `src/lib/finance-context.ts` : `{ id, companyId, name, role, permissions: string[], cashAccountIds?: string[], ip?: string }`. Les rôles sont `ADMIN`, `MANAGER`, `ACCOUNTANT`, `CASHIER`, `SALESPERSON`, `EMPLOYEE`. Permissions en minuscules pointées. Identifiants UUID.

Tous les montants saisis sont des chaînes décimales en euros (`"4000.00"`), tous les montants `*Minor` stockés/retournés sont BigInt centimes (JSON à convertir en string). Devise unique de l’entreprise.

Chaque création financière possède `idempotencyKey` UUID obligatoire. Les dates sont ISO string optionnelles (défaut maintenant). Les services prennent `(actor, input)` ; toutes les méthodes lèvent `BusinessError` avec `status` et `message`.

- `invoice.service.createSale`: `{clientId, salespersonId?, date?, dueDate?, notes?, terms?, idempotencyKey, lines:[{description,quantity:string,unitPrice:string,discountPercent?:string,taxPercent?:string}]}` → Sale avec `invoice` et `lines`. Crée vente confirmée/facturée + facture émise atomiquement.
- `invoice.service.cancelInvoice`: `{id,reason}` → Invoice CANCELLED, vente liée également CANCELLED. Permission `invoices.edit` ou `sales.edit`, périmètre commercial appliqué, motif obligatoire. La facture doit avoir un solde payé nul et aucun paiement VALIDATED ; les paiements doivent être annulés auparavant. Aucun document ni mouvement n’est supprimé. Audit atomique.
- `payment.service.createPayment`: `{invoiceId,amount,method:'CASH'|'CARD'|'TRANSFER'|'CHECK'|'OTHER',cashAccountId?,salespersonId?,date?,reference?,comment?,idempotencyKey}` → Payment. Une seule destination caisse ou commercial.
- `expense.service.createExpense`: `{description,amount,categoryId?,supplierId?,date?,method?,cashAccountId?,comment?,idempotencyKey}` → Expense PENDING.
- `expense.service.approveExpense/rejectExpense`: `{id,comment?}` → Expense. Validation exclut l’auteur de la demande sauf ADMIN.
- `expense.service.payExpense`: `{id,cashAccountId,method?,date?,reference?,idempotencyKey}` → Expense.
- `cash.service.transferCash`: `{sourceCashAccountId,destinationCashAccountId,amount,date?,comment?,idempotencyKey}` → CashTransfer.
- `cash.service.adjustCash`: `{cashAccountId,amount,direction:'IN'|'OUT',reason,idempotencyKey}` → FinancialTransaction ADJUSTMENT ; permission `cash.adjust`, motif ≥5 caractères.
- `salesperson.service.handoverCash`: `{salespersonId?,cashAccountId,amount,date?,comment?,idempotencyKey}` → SalespersonCashHandover.
- `transaction.service.reverseTransaction`: `{id,reason,idempotencyKey}` → FinancialTransaction inverse. Permission `transactions.reverse`.
- `cash.service.getCashBalance(actor,cashAccountId)` → BigInt. `salesperson.service.getSalespersonBalance(actor,salespersonId)` → BigInt.
- `audit.service.audit(tx,actor,{action,entity,entityId,before?,after?})` → AuditLog.
- `finance-context.requirePermission(actor,permission)`, `assertCompany(tx,model,id,companyId)`, `assertCashAccess(tx,actor,id)`, `assertClientAccess(tx,actor,id)`.
- `money.parseMoney(string)` → BigInt ; `money.formatMoney(BigInt|string,currency?)` → string ; `money.calculateLines(lines)` → `{lines,subtotalMinor,discountMinor,taxMinor,totalMinor}`.

Schéma : relations principales `User.roles[].role.permissions[].permission.key`; `User.salesperson`; Client `salespersonId` User ; Sale/Invoice `client`, `salesperson`, `lines`, Sale `invoice`; Invoice `payments`; Expense `requester`, `approver`, `supplier`, `category`, `cashAccount`; Payment `invoice`, `client`, `salesperson`, `cashAccount`; CashAccount `responsible`; FinancialTransaction `creator`, `validator`, `invoice`, `expense`, `client`, `supplier`.

Statuts anglais API à traduire UI : ventes INVOICED/PARTIALLY_PAID/PAID/CANCELLED ; factures ISSUED/PARTIALLY_PAID/PAID/CANCELLED ; dépenses PENDING/APPROVED/REJECTED/PAID ; paiements VALIDATED/REVERSED. Transactions toujours VALIDATED et immuables, annulations de type REVERSAL liées par `reversalOfId` unique. Les soldes sont la somme destinations moins sources de tous les mouvements validés, annulations comprises.

Les dépenses avec une caisse prévue gardent cette caisse au paiement. Les factures sont émises dès la vente et leurs champs et lignes financières sont immuables ; la facture référence le client et l’entreprise courants pour présentation (pas encore de snapshot des coordonnées légales). Les encaissements du portefeuille commercial couvrent le montant collecté quel que soit son mode ; aucune confirmation bancaire automatique.

Précision : arrondi HALF_UP par ligne, successivement sous-total en centimes, remise en centimes, taxe sur le net en centimes. Le total document additionne les résultats des lignes. UUID d’idempotence par entreprise et type de commande ; réutiliser la même clé renvoie l’opération existante appartenant au même auteur. Ne pas partager les clés entre commandes métier différentes.

Trois migrations : schéma initial, contraintes tenant/registre immuable/reversal exact, cohérence différée au COMMIT des états facture/paiement/dépense avec le registre. Utiliser `prisma migrate deploy`, jamais `db push` qui omet les triggers SQL. Le compte DB applicatif en production doit avoir des privilèges DML sans DDL (les migrations utilisent un compte séparé) : un superutilisateur DB peut par définition désactiver les protections.

Initialisation hors démonstration : `npm run company:create`, avec `COMPANY_NAME`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12 caractères minimum) dans l’environnement serveur. Création atomique d’une nouvelle entreprise EUR, six rôles, permissions, premier administrateur, caisse principale à zéro, catégories et audit. Refus d’un email existant ; aucun mot de passe affiché ni aucune donnée existante remplacée. Retirer `ADMIN_PASSWORD` après utilisation. Le seed reste exclusivement réservé au développement.
