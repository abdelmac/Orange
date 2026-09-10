"use client";
import { useEffect, useState } from "react";
import { calculateLines } from "@/lib/money";
import { Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { api, allItems } from "./api";
import { useSession } from "./app-shell";
import { decimalInput, money, related, Row, rows, value } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { ErrorMessage } from "./ui";

export type FormKind =
  | "clients"
  | "suppliers"
  | "users"
  | "cash-accounts"
  | "sales"
  | "payments"
  | "expenses"
  | "handover"
  | "transfer"
  | "pay-expense"
  | "reverse"
  | "adjustment";
type Option = { value: string; label: string };
type Line = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
};
const methods: Option[] = ["CASH", "CARD", "TRANSFER", "CHECK", "OTHER"].map((value) => ({
  value,
  label: translate(value),
}));
function Input({
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
  placeholder,
  min,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        step={step}
        autoComplete={type === "password" ? "new-password" : undefined}
        minLength={type === "password" ? 12 : undefined}
      />
    </label>
  );
}
function Select({
  name,
  label,
  options,
  required = false,
  defaultValue = "",
  onChange,
}: {
  name: string;
  label: string;
  options: Option[];
  required?: boolean;
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <select
        key={`${defaultValue}-${options.length}`}
        name={name}
        required={required}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="">{required ? "Sélectionner…" : "Non renseigné"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RecordForm({
  kind,
  record,
  onSuccess,
  onClose,
  commercial = false,
}: {
  kind: FormKind;
  record?: Row;
  onSuccess: () => void;
  onClose: () => void;
  commercial?: boolean;
}) {
  const { user, company } = useSession(),
    [lookups, setLookups] = useState<Record<string, Row[]>>({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [destination, setDestination] = useState(
      user.role === "SALESPERSON" ? "salesperson" : "cash",
    ),
    [selectedInvoice, setSelectedInvoice] = useState(value(record, "invoiceId", ""));
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: "1", unitPrice: "", discountPercent: "0", taxPercent: "0" },
  ]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const editing =
    Boolean(record?.id) &&
    ["clients", "suppliers", "users", "cash-accounts", "expenses"].includes(kind);
  useEffect(() => {
    const needs: Record<FormKind, string[]> = {
      clients: ["salespeople"],
      suppliers: [],
      users: ["roles"],
      "cash-accounts": ["users"],
      sales: ["clients", "salespeople"],
      payments: ["invoices", "cash-accounts", "salespeople"],
      expenses: ["suppliers", "expense-categories"],
      handover: ["cash-accounts", "salespeople"],
      transfer: ["cash-accounts"],
      "pay-expense": ["cash-accounts"],
      reverse: [],
      adjustment: ["cash-accounts"],
    };
    let active = true;
    Promise.all(
      needs[kind].map(async (key) => {
        try {
          const data = await allItems<Row>(`/api/${key}`);
          return [key, data] as const;
        } catch (error) {
          if (["roles", "clients", "invoices", "expense-categories"].includes(key) && active)
            setError(
              error instanceof Error
                ? error.message
                : "Impossible de charger les données du formulaire.",
            );
          return [key, []] as const;
        }
      }),
    ).then((items) => {
      if (active) {
        setLookups(Object.fromEntries(items));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [kind]);
  const options = (key: string): Option[] =>
    rows(lookups[key]).map((item) => ({
      value: value(item, "id"),
      label: value(
        item,
        "label",
        value(item, "name", value(related(item, "user"), "name", value(item, "number"))),
      ),
    }));
  const defaultString = (key: string, fallback = "") => value(record, key, fallback);
  function updateLine(index: number, key: keyof Line, text: string) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [key]: text } : line)),
    );
  }
  function normalizedLines() {
    return lines.map((line) => ({
      ...line,
      quantity: normalize(line.quantity),
      unitPrice: normalize(line.unitPrice),
      discountPercent: normalize(line.discountPercent),
      taxPercent: normalize(line.taxPercent),
    }));
  }
  function total() {
    try {
      return calculateLines(normalizedLines()).totalMinor.toString();
    } catch {
      return "0";
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const body: Row = { ...form, idempotencyKey };
    for (const key of Object.keys(body)) {
      if (body[key] === "") delete body[key];
    }
    for (const key of ["date", "dueDate"]) {
      if (body[key]) body[key] = new Date(String(body[key])).toISOString();
    }
    if (kind === "sales") body.lines = normalizedLines();
    for (const key of ["amount", "creditLimit"]) {
      if (typeof body[key] === "string") body[key] = normalize(body[key] as string);
    }
    if (kind === "payments") {
      delete body.destination;
      if (destination === "salesperson") {
        delete body.cashAccountId;
        if (user.role === "SALESPERSON") body.salespersonId = user.id;
      } else delete body.salespersonId;
    }
    if (editing) delete body.idempotencyKey;
    if (kind === "handover" && user.role === "SALESPERSON") body.salespersonId = user.id;
    if (["clients", "suppliers", "users", "cash-accounts"].includes(kind)) {
      delete body.idempotencyKey;
      if (form.active !== undefined) body.active = form.active === "true";
      if (kind === "clients" && user.role === "SALESPERSON") body.salespersonId = user.id;
    }
    const paths: Record<FormKind, string> = {
      clients: "clients",
      suppliers: "suppliers",
      users: "users",
      "cash-accounts": "cash-accounts",
      sales: "sales",
      payments: "payments",
      expenses: "expenses",
      handover: "cash/handovers",
      transfer: "cash/transfers",
      "pay-expense": `expenses/${value(record, "id")}/pay`,
      reverse: `transactions/${value(record, "id")}/reverse`,
      adjustment: "cash/adjustments",
    };
    try {
      await api(`/api/${paths[kind]}${editing ? `/${value(record, "id")}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : "L’opération n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }
  const invoice = rows(lookups.invoices).find((i) => i.id === selectedInvoice);
  return (
    <form onSubmit={submit} className="record-form">
      {error && <ErrorMessage message={error} />}
      <div className="form-grid">
        {(kind === "clients" || kind === "suppliers") && (
          <>
            <Input
              name="name"
              label={kind === "clients" ? "Nom du client" : "Nom du fournisseur"}
              required
              defaultValue={defaultString("name")}
            />
            <Input
              name="businessName"
              label="Entreprise"
              defaultValue={defaultString("businessName")}
            />
            <Input name="email" label="Email" type="email" defaultValue={defaultString("email")} />
            <Input
              name="phone"
              label="Téléphone"
              type="tel"
              defaultValue={defaultString("phone")}
            />
            <Input name="address" label="Adresse" defaultValue={defaultString("address")} />
            {kind === "clients" && (
              <>
                <Input name="city" label="Ville" defaultValue={defaultString("city")} />
                <Input
                  name="country"
                  label="Pays"
                  defaultValue={defaultString("country", "France")}
                />
              </>
            )}
            <Input
              name="taxNumber"
              label="Numéro fiscal"
              defaultValue={defaultString("taxNumber")}
            />
            {kind === "clients" ? (
              <>
                <Input
                  name="creditLimit"
                  label={`Limite de crédit (${value(company, "currency", "EUR")})`}
                  defaultValue={decimalInput(record?.creditLimitMinor)}
                  placeholder="0.00"
                />
                {user.role !== "SALESPERSON" && (
                  <Select
                    name="salespersonId"
                    label="Commercial responsable"
                    options={options("salespeople")}
                    defaultValue={defaultString("salespersonId")}
                  />
                )}
                <Select
                  name="active"
                  label="Statut"
                  options={[
                    { value: "true", label: "Actif" },
                    { value: "false", label: "Inactif" },
                  ]}
                  defaultValue={record?.active === false ? "false" : "true"}
                />
              </>
            ) : (
              <Input
                name="bankDetails"
                label="Coordonnées bancaires / IBAN"
                defaultValue={defaultString("bankDetails")}
              />
            )}
            <label className="field full-width">
              <span>Notes</span>
              <textarea name="notes" rows={3} defaultValue={defaultString("notes")} />
            </label>
          </>
        )}
        {kind === "users" && (
          <>
            <Input name="name" label="Nom complet" required defaultValue={defaultString("name")} />
            <Input
              name="email"
              label="Email professionnel"
              type="email"
              required
              defaultValue={defaultString("email")}
            />
            {!editing && (
              <Input
                name="password"
                label="Mot de passe initial (12 caractères minimum)"
                type="password"
                required
              />
            )}
            <Select
              name="roleId"
              label="Rôle et permissions"
              required
              options={options("roles")}
              defaultValue={defaultString(
                "roleId",
                value(
                  related(rows(record?.roles)[0] ?? {}, "role"),
                  "id",
                  commercial
                    ? value(
                        rows(lookups.roles).find((r) => r.name === "SALESPERSON"),
                        "id",
                        "",
                      )
                    : "",
                ),
              )}
            />
            {editing && (
              <Select
                name="active"
                label="Accès au compte"
                options={[
                  { value: "true", label: "Actif" },
                  { value: "false", label: "Désactivé" },
                ]}
                defaultValue={record?.active === false ? "false" : "true"}
              />
            )}
            <div className="form-note full-width">
              <ShieldCheck size={18} />
              <span>
                Les permissions du rôle s’appliquent à tous les écrans et opérations. Un commercial
                accède uniquement à son portefeuille.
              </span>
            </div>
          </>
        )}
        {kind === "cash-accounts" && (
          <>
            <Input
              name="name"
              label="Nom de la caisse"
              required
              defaultValue={defaultString("name")}
            />
            <Select
              name="type"
              label="Type"
              required
              options={[
                { value: "CASH", label: "Caisse en espèces" },
                { value: "BANK", label: "Compte bancaire" },
              ]}
              defaultValue={defaultString("type", "CASH")}
            />
            <Input
              name="currency"
              label="Devise"
              required
              defaultValue={value(company, "currency", "EUR")}
            />
            <Select
              name="responsibleId"
              label="Responsable"
              options={options("users")}
              defaultValue={defaultString("responsibleId")}
            />
            <div className="form-note full-width">
              Le solde est calculé à partir des transactions validées. Toute nouvelle caisse démarre
              à zéro.
            </div>
          </>
        )}
        {kind === "sales" && (
          <>
            <Select name="clientId" label="Client" required options={options("clients")} />
            {user.role !== "SALESPERSON" && (
              <Select name="salespersonId" label="Commercial" options={options("salespeople")} />
            )}
            <Input
              name="date"
              label="Date de vente"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
            <Input name="dueDate" label="Date d’échéance" type="date" />
            <div className="sale-lines full-width">
              <div className="form-section-title">
                <h3>Produits & services</h3>
                <button
                  className="text-link"
                  type="button"
                  onClick={() =>
                    setLines([
                      ...lines,
                      {
                        description: "",
                        quantity: "1",
                        unitPrice: "",
                        discountPercent: "0",
                        taxPercent: "0",
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  Ajouter une ligne
                </button>
              </div>
              {lines.map((line, index) => (
                <div className="sale-line" key={index}>
                  <label className="field line-description">
                    <span>Désignation *</span>
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(index, "description", e.target.value)}
                      required
                      placeholder="Produit ou service"
                    />
                  </label>
                  {(
                    [
                      ["quantity", "Qté"],
                      ["unitPrice", "Prix HT"],
                      ["discountPercent", "Remise %"],
                      ["taxPercent", "TVA %"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="field" key={key}>
                      <span>{label}</span>
                      <input
                        inputMode="decimal"
                        value={line[key]}
                        onChange={(e) => updateLine(index, key, e.target.value)}
                        required
                        placeholder="0.00"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Supprimer la ligne ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <div className="sale-total">
                <span>Total TTC</span>
                <strong>{money(total(), value(company, "currency", "EUR"))}</strong>
              </div>
            </div>
            <label className="field">
              <span>Notes</span>
              <textarea name="notes" rows={2} />
            </label>
            <label className="field">
              <span>Conditions de règlement</span>
              <textarea name="terms" rows={2} />
            </label>
            <div className="form-note full-width">
              <FileNote />
              La validation crée la vente et sa facture dans la même opération.
            </div>
          </>
        )}
        {kind === "payments" && (
          <>
            <Select
              name="invoiceId"
              label="Facture à régler"
              required
              options={rows(lookups.invoices)
                .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
                .map((i) => ({
                  value: value(i, "id"),
                  label: `${value(i, "number")} · ${value(related(i, "client"), "name", "")} · ${money(BigInt(String(i.totalMinor ?? 0)) - BigInt(String(i.paidMinor ?? 0)))}`,
                }))}
              defaultValue={selectedInvoice}
              onChange={setSelectedInvoice}
            />
            <Input name="amount" label="Montant encaissé" required placeholder="4 000,00" />
            {invoice && (
              <div className="form-note full-width">
                Reste à payer sur cette facture :{" "}
                <strong>
                  {money(
                    BigInt(String(invoice.totalMinor ?? 0)) -
                      BigInt(String(invoice.paidMinor ?? 0)),
                  )}
                </strong>
              </div>
            )}
            <Select
              name="method"
              label="Mode de paiement"
              required
              options={methods}
              defaultValue="CASH"
            />
            <Input
              name="date"
              label="Date d’encaissement"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
            {user.role !== "SALESPERSON" && (
              <Select
                name="destination"
                label="Fonds reçus par"
                required
                options={[
                  { value: "cash", label: "Une caisse de l’entreprise" },
                  { value: "salesperson", label: "Un commercial" },
                ]}
                defaultValue={destination}
                onChange={setDestination}
              />
            )}{" "}
            {destination === "cash" ? (
              <Select
                name="cashAccountId"
                label="Caisse destinataire"
                required
                options={options("cash-accounts")}
              />
            ) : user.role !== "SALESPERSON" ? (
              <Select
                name="salespersonId"
                label="Commercial ayant reçu les fonds"
                required
                options={options("salespeople")}
              />
            ) : (
              <div className="form-note full-width">
                Cet encaissement sera ajouté à votre portefeuille. Une remise caisse permettra
                ensuite de transférer les fonds.
              </div>
            )}
            <Input name="reference" label="Référence du paiement" />
            <Input name="comment" label="Commentaire" />
          </>
        )}
        {kind === "expenses" && (
          <>
            <Input
              name="description"
              label="Description de la dépense"
              required
              placeholder="Ex. Achat de fournitures"
              defaultValue={defaultString("description")}
            />
            <Input
              name="amount"
              label="Montant TTC"
              required
              placeholder="1500.00"
              defaultValue={editing ? decimalInput(record?.amountMinor) : ""}
            />
            <Select
              name="categoryId"
              label="Catégorie"
              options={options("expense-categories")}
              defaultValue={defaultString("categoryId")}
            />
            <Select
              name="supplierId"
              label="Fournisseur"
              options={options("suppliers")}
              defaultValue={defaultString("supplierId")}
            />
            <Input
              name="date"
              label="Date de la dépense"
              type="date"
              defaultValue={defaultString("date", new Date().toISOString()).slice(0, 10)}
            />
            <Select
              name="method"
              label="Mode de paiement prévu"
              options={methods}
              defaultValue={defaultString("method", "CASH")}
            />
            <Input name="comment" label="Commentaire" defaultValue={defaultString("comment")} />
            <div className="form-note full-width">
              Votre demande sera soumise à validation. Ajoutez le justificatif depuis la fiche de la
              dépense une fois enregistrée.
            </div>
          </>
        )}
        {kind === "handover" && (
          <>
            {user.role !== "SALESPERSON" && (
              <Select
                name="salespersonId"
                label="Commercial"
                required
                options={options("salespeople")}
              />
            )}
            <Select
              name="cashAccountId"
              label="Caisse destinataire"
              required
              options={options("cash-accounts")}
            />
            <Input name="amount" label="Montant remis" required placeholder="4000.00" />
            <Input
              name="date"
              label="Date de remise"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
            <Input name="comment" label="Commentaire" />
            <div className="form-note full-width">
              La remise réduit les fonds détenus par le commercial et augmente le solde de la caisse
              du même montant.
            </div>
          </>
        )}
        {kind === "transfer" && (
          <>
            <Select
              name="sourceCashAccountId"
              label="Depuis la caisse"
              required
              options={options("cash-accounts")}
            />
            <Select
              name="destinationCashAccountId"
              label="Vers la caisse"
              required
              options={options("cash-accounts")}
            />
            <Input name="amount" label="Montant du transfert" required placeholder="1000.00" />
            <Input
              name="date"
              label="Date du transfert"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
            <Input name="comment" label="Motif du transfert" />
          </>
        )}
        {kind === "pay-expense" && (
          <>
            <div className="confirmation-summary full-width">
              <span>{value(record, "description")}</span>
              <strong>{money(record?.amountMinor)}</strong>
              <p>
                Le paiement sera immédiatement inscrit au registre et déduit de la caisse choisie.
              </p>
            </div>
            <Select
              name="cashAccountId"
              label="Caisse à débiter"
              required
              options={options("cash-accounts")}
            />
            <Select
              name="method"
              label="Mode de paiement"
              required
              options={methods}
              defaultValue="CASH"
            />
            <Input name="reference" label="Référence du règlement" />
          </>
        )}
        {kind === "adjustment" && (
          <>
            <Select
              name="cashAccountId"
              label="Caisse concernée"
              required
              options={options("cash-accounts")}
            />
            <Select
              name="direction"
              label="Sens de l’ajustement"
              required
              defaultValue="IN"
              options={[
                { value: "IN", label: "Ajouter des fonds (entrée)" },
                { value: "OUT", label: "Retirer des fonds (sortie)" },
              ]}
            />
            <Input name="amount" label="Montant" required placeholder="1000.00" />
            <label className="field full-width">
              <span>Motif obligatoire *</span>
              <textarea
                name="reason"
                rows={3}
                minLength={5}
                required
                placeholder="Ex. Reprise du solde initial vérifié…"
              />
            </label>
            <div className="form-note full-width">
              Cet ajustement crée une écriture permanente dans le registre. Son motif et son auteur
              sont conservés.
            </div>
          </>
        )}
        {kind === "reverse" && (
          <>
            <div className="confirmation-summary full-width">
              <span>Annulation de {value(record, "number")}</span>
              <strong>{money(record?.amountMinor)}</strong>
              <p>
                Une écriture inverse sera créée. L’opération originale et son historique seront
                conservés.
              </p>
            </div>
            <label className="field full-width">
              <span>Motif de l’annulation *</span>
              <textarea
                name="reason"
                required
                minLength={5}
                rows={3}
                placeholder="Expliquez la correction à apporter…"
              />
            </label>
          </>
        )}
      </div>
      <footer className="form-footer">
        <span>* Champs obligatoires</span>
        <button className="button secondary" type="button" onClick={onClose}>
          Annuler
        </button>
        <button
          className={`button ${kind === "reverse" ? "destructive" : "primary"}`}
          disabled={busy || loading}
        >
          <Save size={16} />
          {busy
            ? "Enregistrement…"
            : kind === "reverse"
              ? "Confirmer l’annulation"
              : kind === "pay-expense"
                ? "Confirmer le paiement"
                : kind === "expenses" && !editing
                  ? "Soumettre la demande"
                  : editing
                    ? "Enregistrer les modifications"
                    : "Enregistrer"}
        </button>
      </footer>
    </form>
  );
}
function normalize(text: string) {
  return text.replace(/\s/g, "").replace(",", ".");
}
function FileNote() {
  return <ShieldCheck size={17} />;
}
