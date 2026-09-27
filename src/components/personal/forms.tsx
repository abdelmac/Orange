"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, post } from "../api";
import { ErrorMessage, Modal } from "../ui";
import { decimalInput } from "@/lib/format";
import {
  accountLabels,
  personalToday,
  typeLabels,
  type PersonalOverview,
  type PersonalTransactionView,
  type TransactionType,
} from "./types";

export type PersonalForm =
  | { kind: "transaction"; type: TransactionType; record?: PersonalTransactionView }
  | { kind: "account" | "category" | "budget"; categoryId?: string; limit?: string };
export function PersonalEditor({
  form,
  data,
  close,
  saved,
}: {
  form: PersonalForm;
  data: PersonalOverview;
  close: () => void;
  saved: (message: string) => void;
}) {
  const record = form.kind === "transaction" ? form.record : undefined;
  const [type, setType] = useState<TransactionType>(
    form.kind === "transaction" ? form.type : "EXPENSE",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string>(record?.idempotencyKey ?? "");
  const accounts = data.accounts.filter((account) => !account.isArchived);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields.entries());
    try {
      let message = "Enregistré dans votre espace personnel.";
      if (form.kind === "transaction") {
        key.current ||= crypto.randomUUID();
        const body = {
          ...values,
          type,
          amount: String(values.amount).replace(",", "."),
          destinationAccountId: type === "TRANSFER" ? values.destinationAccountId : null,
          categoryId: type !== "TRANSFER" ? values.categoryId || null : null,
          attachmentId: record?.attachmentId ?? null,
          idempotencyKey: key.current,
          ...(record ? { updatedAt: record.updatedAt } : {}),
        };
        const transaction = await api<{ id: string }>(
          `/api/personal/transactions${record ? `/${record.id}` : ""}`,
          { method: record ? "PATCH" : "POST", body: JSON.stringify(body) },
        );
        const file = fields.get("file");
        if (file instanceof File && file.size) {
          const upload = new FormData();
          upload.set("transactionId", transaction.id);
          upload.set("file", file);
          try {
            await api("/api/personal/attachments", { method: "POST", body: upload });
          } catch (error) {
            message = `Transaction enregistrée. Justificatif non joint : ${error instanceof Error ? error.message : "réessayez depuis la liste"}`;
          }
        }
      } else if (form.kind === "budget") {
        const [year, month] = data.month.split("-");
        await post("/api/personal/budgets", {
          ...values,
          limit: String(values.limit).replace(",", "."),
          month,
          year,
        });
      } else if (form.kind === "account") {
        await post("/api/personal/accounts", {
          ...values,
          initialBalance: String(values.initialBalance).replace(",", "."),
        });
      } else await post("/api/personal/categories", values);
      saved(message);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  const title =
    form.kind === "transaction"
      ? `${record ? "Modifier" : "Ajouter"} · ${typeLabels[type].toLowerCase()}`
      : form.kind === "account"
        ? "Nouveau compte personnel"
        : form.kind === "budget"
          ? `Budget · ${data.month}`
          : "Nouvelle catégorie";
  return (
    <Modal
      title={title}
      subtitle="Espace personnel · visible uniquement par vous"
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form className="personal-form" onSubmit={submit}>
        {error && <ErrorMessage message={error} />}
        {form.kind === "transaction" && (
          <>
            <div className="personal-type-tabs" role="group" aria-label="Type de transaction">
              {Object.entries(typeLabels).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={type === value ? "selected" : ""}
                  aria-pressed={type === value}
                  onClick={() => setType(value as TransactionType)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!accounts.length && (
              <p role="alert">Créez d’abord un compte personnel depuis « Comptes ».</p>
            )}
            <label className="field personal-amount">
              <span>Montant ({data.currency}) *</span>
              <input
                name="amount"
                inputMode="decimal"
                required
                placeholder="0,00"
                defaultValue={record ? decimalInput(record.amountMinor) : ""}
                pattern="[0-9]+([.,][0-9]{1,2})?"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>{type === "TRANSFER" ? "Compte source" : "Compte"} *</span>
                <select
                  name="accountId"
                  required
                  defaultValue={record?.accountId ?? accounts[0]?.id}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              {type === "TRANSFER" ? (
                <label className="field">
                  <span>Compte destinataire *</span>
                  <select
                    name="destinationAccountId"
                    required
                    defaultValue={record?.destinationAccountId ?? ""}
                  >
                    <option value="">Choisir un compte</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field">
                  <span>Catégorie</span>
                  <select
                    name="categoryId"
                    key={type}
                    defaultValue={record?.category?.type === type ? (record.categoryId ?? "") : ""}
                  >
                    <option value="">Sans catégorie</option>
                    {data.categories
                      .filter((category) => category.type === type)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <label className="field">
              <span>Description *</span>
              <input
                name="description"
                required
                maxLength={300}
                defaultValue={record?.description}
                placeholder={
                  type === "EXPENSE"
                    ? "Courses, transport, repas…"
                    : type === "INCOME"
                      ? "Salaire, remboursement…"
                      : "Virement vers mon épargne"
                }
              />
            </label>
            <label className="field">
              <span>Date *</span>
              <input
                name="date"
                type="date"
                required
                defaultValue={record?.date.slice(0, 10) ?? personalToday()}
              />
            </label>
            <details>
              <summary>Notes et justificatif</summary>
              <label className="field">
                <span>Notes</span>
                <textarea name="notes" maxLength={2000} defaultValue={record?.notes} />
              </label>
              {record?.attachment ? (
                <a href={`/api/personal/attachments/${record.attachment.id}`}>
                  Télécharger {record.attachment.originalName}
                </a>
              ) : (
                <label className="field">
                  <span>Photo ou PDF (10 Mo maximum)</span>
                  <input
                    type="file"
                    name="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                  />
                </label>
              )}
            </details>
          </>
        )}
        {form.kind === "account" && (
          <>
            <label className="field">
              <span>Nom *</span>
              <input name="name" required maxLength={100} placeholder="Mon compte courant" />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="type">
                {Object.entries(accountLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Solde initial ({data.currency})</span>
              <input
                name="initialBalance"
                inputMode="decimal"
                defaultValue="0"
                required
                pattern="-?[0-9]+([.,][0-9]{1,2})?"
              />
            </label>
            <p className="personal-hint">
              Le solde évolue ensuite uniquement avec vos transactions. Un découvert est autorisé.
            </p>
          </>
        )}
        {form.kind === "category" && (
          <>
            <label className="field">
              <span>Nom *</span>
              <input name="name" required maxLength={80} />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="type">
                <option value="EXPENSE">Dépense</option>
                <option value="INCOME">Revenu</option>
              </select>
            </label>
            <label className="field">
              <span>Couleur</span>
              <input type="color" name="color" defaultValue="#f97316" />
            </label>
          </>
        )}
        {form.kind === "budget" && (
          <>
            <label className="field">
              <span>Catégorie *</span>
              <select name="categoryId" required defaultValue={form.categoryId ?? ""}>
                <option value="">Choisir une catégorie</option>
                {data.categories
                  .filter((category) => category.type === "EXPENSE")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Budget mensuel ({data.currency}) *</span>
              <input
                name="limit"
                required
                inputMode="decimal"
                pattern="[0-9]+([.,][0-9]{1,2})?"
                defaultValue={form.limit ? decimalInput(form.limit) : ""}
                placeholder="500,00"
              />
            </label>
            <p className="personal-hint">
              Enregistrer remplace le budget de cette catégorie pour le mois sélectionné.
            </p>
          </>
        )}
        <button
          className="button primary personal-save"
          type="submit"
          disabled={busy || (form.kind === "transaction" && !accounts.length)}
        >
          {busy ? "Enregistrement…" : record ? "Enregistrer les modifications" : "Enregistrer"}
        </button>
      </form>
    </Modal>
  );
}

export function PersonalPassword() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post(
        "/api/auth/change-password",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      router.replace("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="personal-form" onSubmit={change}>
      <h2>Changer de mot de passe</h2>
      {error && <ErrorMessage message={error} />}
      <label className="field">
        <span>Mot de passe actuel</span>
        <input type="password" name="currentPassword" autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>Nouveau mot de passe (12 caractères minimum)</span>
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <p className="personal-hint">Toutes vos sessions seront fermées après le changement.</p>
      <button className="button primary" disabled={busy}>
        Changer de mot de passe
      </button>
    </form>
  );
}

export function PersonalProfile({
  name,
  email,
  usageType,
}: {
  name: string;
  email: string;
  usageType: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify(fields) });
      window.location.assign(fields.companyName ? "/" : "/personal/parametres");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Modification impossible.");
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Mon profil</h2>
      <p>{email}</p>
      {error && <ErrorMessage message={error} />}
      <form className="personal-form" onSubmit={save}>
        <label className="field">
          <span>Nom complet</span>
          <input
            name="name"
            defaultValue={name}
            minLength={2}
            maxLength={120}
            required
            autoComplete="name"
          />
        </label>
        <button className="button secondary" disabled={busy}>
          Enregistrer mon nom
        </button>
      </form>
      {usageType === "PERSONAL" && (
        <form className="personal-form" onSubmit={save}>
          <h3>Ajouter mon entreprise</h3>
          <p>Votre espace personnel restera privé. L’espace entreprise commence gratuitement.</p>
          <label className="field">
            <span>Nom de l’entreprise</span>
            <input
              name="companyName"
              minLength={2}
              maxLength={200}
              required
              autoComplete="organization"
            />
          </label>
          <button className="button primary" disabled={busy}>
            Créer mon espace entreprise
          </button>
        </form>
      )}
    </>
  );
}
