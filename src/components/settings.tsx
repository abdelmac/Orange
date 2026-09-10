"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { useSession } from "./app-shell";
import { api, post } from "./api";
import { value } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { ErrorMessage } from "./ui";

export function Settings() {
  const { user, company, permissions, can } = useSession();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [companyError, setCompanyError] = useState(""),
    [companySuccess, setCompanySuccess] = useState(""),
    [companyBusy, setCompanyBusy] = useState(false);
  const router = useRouter();
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await post(
        "/api/auth/change-password",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompanyError("");
    setCompanySuccess("");
    setCompanyBusy(true);
    try {
      await api("/api/company", {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      setCompanySuccess(
        "Les informations de l’entreprise ont été mises à jour. Elles apparaîtront sur vos factures.",
      );
    } catch (error) {
      setCompanyError(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setCompanyBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VOTRE ESPACE</div>
          <h1>Paramètres</h1>
          <p>Votre profil, votre sécurité et les informations de votre entreprise.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="card settings-card">
          <h2>Mon profil</h2>
          <dl className="detail-fields">
            <div>
              <dt>Nom</dt>
              <dd>{value(user, "name")}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{value(user, "email")}</dd>
            </div>
            <div>
              <dt>Rôle</dt>
              <dd>{translate(user.role)}</dd>
            </div>
            <div>
              <dt>Entreprise</dt>
              <dd>{value(company, "name")}</dd>
            </div>
            <div>
              <dt>Devise de référence</dt>
              <dd>{value(company, "currency")}</dd>
            </div>
            <div>
              <dt>Langue</dt>
              <dd>Français</dd>
            </div>
          </dl>
          <div className="form-note">
            <Globe2 size={18} />
            Les montants sont présentés dans la devise de votre entreprise.
          </div>
        </section>
        <section className="card settings-card">
          <h2>
            <LockKeyhole size={19} />
            Changer mon mot de passe
          </h2>
          <p className="muted">
            Utilisez au moins 12 caractères, avec un mot de passe unique. Vous devrez ensuite vous
            reconnecter.
          </p>
          {error && <ErrorMessage message={error} />}
          <form onSubmit={change}>
            <label className="field">
              <span>Mot de passe actuel</span>
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <label className="field">
              <span>Nouveau mot de passe</span>
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button className="button primary" disabled={busy}>
              <Save size={17} />
              {busy ? "Enregistrement…" : "Modifier mon mot de passe"}
            </button>
          </form>
        </section>
        {can("settings.edit") && (
          <section className="card settings-card permissions-card">
            <h2>
              <Building2 size={19} />
              Informations de l’entreprise
            </h2>
            <p className="muted">
              Ces coordonnées figurent sur les factures et les rapports de votre entreprise.
            </p>
            {companyError && <ErrorMessage message={companyError} />}{" "}
            {companySuccess && (
              <div className="alert success" role="status">
                {companySuccess}
              </div>
            )}
            <form onSubmit={saveCompany}>
              <div className="form-grid">
                {[
                  ["name", "Raison sociale"],
                  ["email", "Email de contact"],
                  ["phone", "Téléphone"],
                  ["taxNumber", "Identifiant fiscal"],
                ].map(([name, label]) => (
                  <label className="field" key={name}>
                    <span>
                      {label}
                      {name === "name" ? " *" : ""}
                    </span>
                    <input
                      name={name}
                      type={name === "email" ? "email" : name === "phone" ? "tel" : "text"}
                      required={name === "name"}
                      defaultValue={value(company, name, "")}
                    />
                  </label>
                ))}
                <label className="field full-width">
                  <span>Adresse complète</span>
                  <textarea name="address" rows={3} defaultValue={value(company, "address", "")} />
                </label>
              </div>
              <button className="button primary" disabled={companyBusy}>
                <Save size={16} />
                {companyBusy ? "Enregistrement…" : "Enregistrer les informations"}
              </button>
            </form>
          </section>
        )}
        <section className="card settings-card permissions-card">
          <h2>
            <ShieldCheck size={19} />
            Mes autorisations
          </h2>
          <p className="muted">
            Ces autorisations sont gérées par l’administrateur de votre entreprise.
          </p>
          <div className="permission-list">
            {permissions.map((p) => (
              <code key={p}>{p}</code>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
