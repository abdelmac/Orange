import { Row, date, money, related, rows, value } from "@/lib/format";
import { translate } from "@/lib/i18n";
import type { FormKind } from "./record-form";

export interface Column {
  label: string;
  key: string;
  render?: (row: Row) => string;
  kind?: "identity" | "money" | "status" | "date";
}
export interface ModuleConfig {
  title: string;
  description: string;
  endpoint: string;
  permission: string;
  create?: FormKind;
  createPermission?: string;
  createLabel?: string;
  columns: Column[];
  entity?: string;
  editPermission?: string;
}
const person = (key: string) => (r: Row) => value(related(r, key), "name");
const active = (r: Row) => (r.active === false ? "Inactif" : "Actif");
export const modules: Record<string, ModuleConfig> = {
  clients: {
    title: "Clients",
    description: "Construisez des relations durables. Gardez vos créances à l’œil.",
    endpoint: "clients",
    permission: "clients.view",
    create: "clients",
    createPermission: "clients.create",
    editPermission: "clients.edit",
    createLabel: "Nouveau client",
    columns: [
      { key: "name", label: "Client", kind: "identity" },
      { key: "phone", label: "Téléphone" },
      { key: "salesperson", label: "Commercial", render: person("salesperson") },
      { key: "dueMinor", label: "Solde dû", kind: "money" },
      { key: "active", label: "Statut", render: active },
    ],
  },
  fournisseurs: {
    title: "Fournisseurs",
    description: "Vos partenaires, leurs coordonnées et les règlements à suivre.",
    endpoint: "suppliers",
    permission: "suppliers.view",
    create: "suppliers",
    createPermission: "suppliers.create",
    editPermission: "suppliers.edit",
    createLabel: "Nouveau fournisseur",
    columns: [
      { key: "name", label: "Fournisseur", kind: "identity" },
      { key: "phone", label: "Téléphone" },
      { key: "email", label: "Email" },
      { key: "dueMinor", label: "Reste à payer", kind: "money" },
    ],
  },
  commerciaux: {
    title: "Commerciaux",
    description: "Suivez la performance de votre équipe et les fonds à remettre.",
    endpoint: "salespeople",
    permission: "salespeople.view",
    create: "users",
    createPermission: "users.create",
    createLabel: "Ajouter un commercial",
    columns: [
      { key: "name", label: "Commercial", kind: "identity" },
      { key: "clientsCount", label: "Clients" },
      { key: "salesMinor", label: "Ventes réalisées", kind: "money" },
      { key: "collectedMinor", label: "Encaissements", kind: "money" },
      { key: "handedOverMinor", label: "Déjà remis", kind: "money" },
      { key: "heldMinor", label: "À remettre", kind: "money" },
    ],
  },
  utilisateurs: {
    title: "Utilisateurs",
    description: "Une équipe bien organisée, avec le bon accès pour chacun.",
    endpoint: "users",
    permission: "users.view",
    create: "users",
    createPermission: "users.create",
    editPermission: "users.edit",
    createLabel: "Nouvel utilisateur",
    columns: [
      { key: "name", label: "Collaborateur", kind: "identity" },
      { key: "email", label: "Email" },
      {
        key: "role",
        label: "Rôle",
        render: (r) => translate(r.role ?? related(rows(r.roles)[0] ?? {}, "role").name),
      },
      { key: "active", label: "Statut", render: active },
      { key: "createdAt", label: "Ajouté le", kind: "date" },
    ],
  },
  caisse: {
    title: "Caisses & trésorerie",
    description: "Une vision précise des fonds, de leur origine à leur destination.",
    endpoint: "cash-accounts",
    permission: "cash.view",
    create: "cash-accounts",
    createPermission: "cash.create",
    editPermission: "cash.edit",
    createLabel: "Nouvelle caisse",
    columns: [
      { key: "name", label: "Caisse", kind: "identity" },
      { key: "type", label: "Type", render: (r) => translate(r.type) },
      { key: "responsible", label: "Responsable", render: person("responsible") },
      { key: "currency", label: "Devise" },
      { key: "balanceMinor", label: "Solde disponible", kind: "money" },
      { key: "active", label: "Statut", render: active },
    ],
  },
  ventes: {
    title: "Ventes",
    description: "De la première vente au dernier règlement, suivez chaque étape.",
    endpoint: "sales",
    permission: "sales.view",
    create: "sales",
    createPermission: "sales.create",
    createLabel: "Nouvelle vente",
    columns: [
      { key: "number", label: "Vente", kind: "identity" },
      { key: "client", label: "Client", render: person("client") },
      { key: "salesperson", label: "Commercial", render: person("salesperson") },
      { key: "date", label: "Date", kind: "date" },
      { key: "totalMinor", label: "Montant TTC", kind: "money" },
      { key: "status", label: "Statut", kind: "status" },
    ],
  },
  factures: {
    title: "Factures",
    description: "Des factures claires, des échéances suivies, des paiements rapprochés.",
    endpoint: "invoices",
    permission: "invoices.view",
    create: "sales",
    createPermission: "sales.create",
    createLabel: "Créer une facture",
    entity: "INVOICE",
    columns: [
      { key: "number", label: "Facture", kind: "identity" },
      { key: "client", label: "Client", render: person("client") },
      { key: "dueDate", label: "Échéance", kind: "date" },
      { key: "totalMinor", label: "Total TTC", kind: "money" },
      { key: "paidMinor", label: "Payé", kind: "money" },
      {
        key: "remainingMinor",
        label: "Reste dû",
        render: (r) =>
          money(
            r.status === "CANCELLED"
              ? 0n
              : BigInt(String(r.totalMinor ?? 0)) - BigInt(String(r.paidMinor ?? 0)),
          ),
        kind: "money",
      },
      { key: "status", label: "Statut", kind: "status" },
    ],
  },
  encaissements: {
    title: "Encaissements",
    description: "Chaque paiement client, rattaché à sa facture et à son destinataire.",
    endpoint: "payments",
    permission: "payments.view",
    create: "payments",
    createPermission: "payments.create",
    createLabel: "Nouvel encaissement",
    entity: "PAYMENT",
    columns: [
      { key: "number", label: "Paiement", kind: "identity" },
      { key: "client", label: "Client", render: person("client") },
      { key: "invoice", label: "Facture", render: (r) => value(related(r, "invoice"), "number") },
      { key: "method", label: "Mode", render: (r) => translate(r.method) },
      { key: "date", label: "Date", kind: "date" },
      { key: "amountMinor", label: "Montant", kind: "money" },
      { key: "status", label: "Statut", kind: "status" },
    ],
  },
  depenses: {
    title: "Dépenses",
    description: "De la demande au paiement, chaque dépense suit le bon parcours.",
    endpoint: "expenses",
    permission: "expenses.view",
    create: "expenses",
    createPermission: "expenses.create",
    editPermission: "expenses.edit",
    createLabel: "Nouvelle dépense",
    entity: "EXPENSE",
    columns: [
      { key: "description", label: "Dépense", kind: "identity" },
      { key: "requester", label: "Demandeur", render: person("requester") },
      { key: "category", label: "Catégorie", render: person("category") },
      { key: "date", label: "Date", kind: "date" },
      { key: "amountMinor", label: "Montant", kind: "money" },
      { key: "status", label: "Statut", kind: "status" },
    ],
  },
  transactions: {
    title: "Transactions",
    description: "Le registre de tous les mouvements d’argent. Un historique qui reste.",
    endpoint: "transactions",
    permission: "transactions.view",
    entity: "TRANSACTION",
    columns: [
      { key: "number", label: "Transaction", kind: "identity" },
      { key: "type", label: "Opération", render: (r) => translate(r.type) },
      { key: "sourceLabel", label: "Origine" },
      { key: "destinationLabel", label: "Destination" },
      { key: "creator", label: "Enregistrée par", render: person("creator") },
      { key: "date", label: "Date", kind: "date" },
      { key: "amountMinor", label: "Montant", kind: "money" },
      { key: "status", label: "Statut", kind: "status" },
    ],
  },
  audit: {
    title: "Journal d’audit",
    description: "Qui a fait quoi, et quand. La mémoire de votre entreprise.",
    endpoint: "audit",
    permission: "audit.view",
    columns: [
      { key: "action", label: "Action", kind: "identity" },
      {
        key: "userName",
        label: "Utilisateur",
        render: (r) =>
          value(
            r,
            "actorName",
            value(
              r,
              "userName",
              value(related(r, "user"), "name", value(related(r, "actor"), "name")),
            ),
          ),
      },
      { key: "entity", label: "Objet", render: (row) => translate(row.entity) },
      { key: "createdAt", label: "Date et heure", render: (r) => date(r.createdAt, true) },
      { key: "ip", label: "Adresse IP" },
    ],
  },
};
