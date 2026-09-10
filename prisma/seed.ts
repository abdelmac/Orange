import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { roleLabels, rolePermissions, permissionDefinitions } from "../src/lib/rbac";
import type { Actor } from "../src/lib/finance-context";
import { createSale } from "../src/services/invoice.service";
import { createPayment } from "../src/services/payment.service";
import {
  approveExpense,
  createExpense,
  payExpense,
  rejectExpense,
} from "../src/services/expense.service";
import { adjustCash, transferCash } from "../src/services/cash.service";
import { handoverCash } from "../src/services/salesperson.service";

loadEnvConfig(process.cwd());

function key(name: string) {
  const hex = createHash("sha256").update(`orange-demo-v1:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Le seed de démonstration est interdit en production.");
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12)
    throw new Error(
      "Définissez DEMO_PASSWORD (12 caractères minimum) dans .env pour le développement.",
    );
  const company = await db.company.upsert({
    where: { id: key("company") },
    update: {},
    create: {
      id: key("company"),
      name: "Demo Entreprise SARL",
      currency: "EUR",
      address: "24 avenue de la République, 75011 Paris",
      phone: "+33 1 42 00 00 00",
      email: "contact@demo.local",
      taxNumber: "FR-DEMO-2026",
    },
  });
  for (const permission of permissionDefinitions)
    await db.permission.upsert({
      where: { key: permission },
      create: { key: permission },
      update: {},
    });
  const permissions = await db.permission.findMany();
  for (const [name, keys] of Object.entries(rolePermissions)) {
    const role = await db.role.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      create: { companyId: company.id, name, label: roleLabels[name] },
      update: { label: roleLabels[name] },
    });
    for (const permission of permissions.filter((permission) => keys.includes(permission.key)))
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { companyId: company.id, roleId: role.id, permissionId: permission.id },
        update: {},
      });
  }
  const users = [
    { email: "admin@demo.local", name: "Alexandre Martin", role: "ADMIN" },
    { email: "manager@demo.local", name: "Sophie Laurent", role: "MANAGER" },
    { email: "comptable@demo.local", name: "Thomas Bernard", role: "ACCOUNTANT" },
    { email: "caissier@demo.local", name: "Camille Robert", role: "CASHIER" },
    { email: "commercial@demo.local", name: "Jean Dupont", role: "SALESPERSON" },
    { email: "employe@demo.local", name: "Emma Petit", role: "EMPLOYEE" },
  ];
  const actors: Record<string, Actor> = {};
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD);
  for (const item of users) {
    const user = await db.user.upsert({
      where: { email: item.email },
      create: { companyId: company.id, name: item.name, email: item.email, passwordHash },
      update: {},
    });
    if (user.companyId !== company.id)
      throw new Error(`Le compte ${item.email} existe dans une autre entreprise.`);
    const role = await db.role.findUniqueOrThrow({
      where: { companyId_name: { companyId: company.id, name: item.role } },
    });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { companyId: company.id, userId: user.id, roleId: role.id },
      update: {},
    });
    if (item.role === "SALESPERSON")
      await db.salespersonProfile.upsert({
        where: { userId: user.id },
        create: { companyId: company.id, userId: user.id, commissionPercent: "3" },
        update: {},
      });
    actors[item.role] = {
      id: user.id,
      companyId: company.id,
      name: user.name,
      role: item.role,
      permissions: rolePermissions[item.role],
    };
  }
  const admin = actors.ADMIN,
    manager = actors.MANAGER,
    commercial = actors.SALESPERSON,
    cashier = actors.CASHIER;
  const cashAccounts = [];
  for (const [name, type] of [
    ["Caisse principale", "CASH"],
    ["Banque", "BANK"],
    ["Petite caisse", "CASH"],
  ])
    cashAccounts.push(
      await db.cashAccount.upsert({
        where: { companyId_name: { companyId: company.id, name } },
        create: { companyId: company.id, name, type, responsibleId: cashier.id },
        update: {},
      }),
    );
  const categories = [];
  for (const name of [
    "Carburant",
    "Transport",
    "Achats",
    "Fournitures",
    "Salaires",
    "Repas",
    "Maintenance",
    "Loyer",
    "Marketing",
    "Taxes",
    "Autre",
  ])
    categories.push(
      await db.expenseCategory.upsert({
        where: { companyId_name: { companyId: company.id, name } },
        create: { companyId: company.id, name },
        update: {},
      }),
    );
  const clients = [];
  const names = [
    "Dupont SARL",
    "Maison Atelier",
    "Nova Distribution",
    "Studio Horizon",
    "Le Comptoir Vert",
    "Groupe Beaumont",
    "Lumière & Co",
    "Atelier Rivage",
    "Solutions Atlas",
    "Les Jardins de Léa",
  ];
  for (let i = 0; i < names.length; i++)
    clients.push(
      await db.client.upsert({
        where: { id: key(`client-${i}`) },
        update: {},
        create: {
          id: key(`client-${i}`),
          companyId: company.id,
          name: names[i],
          businessName: names[i],
          email: `contact${i + 1}@example.test`,
          phone: `+33 6 10 20 30 ${String(i).padStart(2, "0")}`,
          address: `${i + 10} rue des Artisans`,
          city: ["Paris", "Lyon", "Bordeaux"][i % 3],
          country: "France",
          salespersonId: commercial.id,
        },
      }),
    );
  const suppliers = [];
  for (const [i, name] of [
    "Bureau Services",
    "Énergie Plus",
    "Mobilité Pro",
    "Papeterie Centrale",
    "Immobilier République",
  ].entries())
    suppliers.push(
      await db.supplier.upsert({
        where: { id: key(`supplier-${i}`) },
        update: {},
        create: {
          id: key(`supplier-${i}`),
          companyId: company.id,
          name,
          email: `fournisseur${i + 1}@example.test`,
          phone: "+33 1 40 20 30 40",
          address: "Paris, France",
        },
      }),
    );

  await adjustCash(admin, {
    cashAccountId: cashAccounts[0].id,
    amount: "12000.00",
    direction: "IN",
    reason: "Reprise du solde initial de démonstration",
    idempotencyKey: key("opening-cash"),
  });
  await adjustCash(admin, {
    cashAccountId: cashAccounts[1].id,
    amount: "25000.00",
    direction: "IN",
    reason: "Reprise du solde bancaire de démonstration",
    idempotencyKey: key("opening-bank"),
  });
  const amounts = [
    "10000.00",
    "2450.00",
    "7800.00",
    "3200.00",
    "1450.00",
    "5400.00",
    "890.00",
    "6300.00",
    "2150.00",
    "1800.00",
  ];
  for (let i = 0; i < clients.length; i++) {
    const date = new Date(Date.now() - (9 - i) * 86400000).toISOString();
    const sale = await createSale(commercial, {
      clientId: clients[i].id,
      lines: [
        {
          description: [
            "Prestation de conseil",
            "Fourniture de matériel",
            "Accompagnement commercial",
          ][i % 3],
          quantity: "1",
          unitPrice: amounts[i],
          taxPercent: "0",
        },
      ],
      date,
      notes: "Opération de démonstration",
      idempotencyKey: key(`sale-${i}`),
    });
    if (!sale.invoice) throw new Error("Facture absente");
    if (i === 0) {
      await createPayment(commercial, {
        invoiceId: sale.invoice.id,
        amount: "4000.00",
        method: "CASH",
        salespersonId: commercial.id,
        date,
        idempotencyKey: key("payment-0"),
      });
      await handoverCash(commercial, {
        cashAccountId: cashAccounts[0].id,
        salespersonId: commercial.id,
        amount: "2500.00",
        date,
        idempotencyKey: key("handover-0"),
      });
    } else if (i % 3 !== 0) {
      await createPayment(admin, {
        invoiceId: sale.invoice.id,
        amount: amounts[i],
        method: i % 2 ? "TRANSFER" : "CASH",
        cashAccountId: cashAccounts[i % 2].id,
        date,
        idempotencyKey: key(`payment-${i}`),
      });
    }
  }
  for (let i = 0; i < 6; i++) {
    const expense = await createExpense(actors.EMPLOYEE, {
      description: [
        "Fournitures de bureau",
        "Carburant déplacements clients",
        "Loyer du bureau",
        "Campagne de communication",
        "Entretien du véhicule",
        "Repas équipe",
      ][i],
      amount: ["185.50", "120.00", "1500.00", "450.00", "260.00", "95.00"][i],
      categoryId: categories[[3, 0, 7, 8, 6, 5][i]].id,
      supplierId: suppliers[i % 5].id,
      date: new Date(Date.now() - i * 86400000).toISOString(),
      idempotencyKey: key(`expense-${i}`),
    });
    if (i < 3 && expense.status === "PENDING") await approveExpense(manager, { id: expense.id });
    if (i < 2)
      await payExpense(cashier, {
        id: expense.id,
        cashAccountId: cashAccounts[0].id,
        method: "CASH",
        idempotencyKey: key(`expense-payment-${i}`),
      });
    if (i === 5 && expense.status === "PENDING")
      await rejectExpense(manager, { id: expense.id, comment: "Justificatif non conforme" });
  }
  await transferCash(admin, {
    sourceCashAccountId: cashAccounts[0].id,
    destinationCashAccountId: cashAccounts[2].id,
    amount: "500.00",
    comment: "Provision de la petite caisse",
    idempotencyKey: key("transfer-petty"),
  });
  console.log(
    "Démonstration prête : 6 utilisateurs, 10 clients, 5 fournisseurs, 10 ventes/factures, 6 dépenses. Mot de passe : valeur de DEMO_PASSWORD (développement uniquement).",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
