"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  Layers,
  UserRound,
} from "lucide-react";
import { Brand } from "./app-shell";
import { ThemePicker } from "./theme-picker";
import { post } from "./api";
import "./account-pages.css";

const usageOptions = [
  {
    value: "BUSINESS",
    title: "Pour mon entreprise",
    description: "Factures, clients, caisse, dépenses et équipe.",
    icon: Building2,
  },
  {
    value: "PERSONAL",
    title: "Pour mes finances personnelles",
    description: "Revenus, dépenses, comptes et budget personnel.",
    icon: UserRound,
  },
  {
    value: "BOTH",
    title: "Les deux",
    description: "Deux espaces séparés, un seul compte. Vos finances personnelles restent privées.",
    icon: Layers,
  },
] as const;

export function RegistrationForm() {
  const router = useRouter();
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [data, setData] = useState({
    name: "",
    email: "",
    password: "",
    usageType: "BUSINESS",
    companyName: "",
    currency: "EUR",
  });
  function field(key: keyof typeof data, value: string) {
    setData((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await post<{ redirectTo: string }>("/api/auth/register", data);
      router.push(result.redirectTo);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de créer le compte.");
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <header className="account-public-header">
        <Brand />
        <ThemePicker />
      </header>
      <section className="account-card registration-card">
        <p className="eyebrow">COMMENCEZ GRATUITEMENT</p>
        <h1>
          {
            [
              "Créez votre compte",
              "Comment souhaitez-vous utiliser l’application ?",
              "Un espace à votre image",
              "Tout est prêt pour commencer",
            ][step]
          }
        </h1>
        <p className="muted">Étape {step + 1} sur 4 · Aucune carte bancaire nécessaire.</p>
        <div className="onboarding-progress" aria-label={`Étape ${step + 1} sur 4`}>
          {[0, 1, 2, 3].map((number) => (
            <span key={number} data-active={number <= step} />
          ))}
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          {step === 0 && (
            <>
              <label className="field">
                <span>Votre nom</span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={data.name}
                  onChange={(event) => field("name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Adresse email</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={data.email}
                  onChange={(event) => field("email", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Mot de passe · 12 caractères minimum</span>
                <div className="password-input">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={data.password}
                    onChange={(event) => field("password", event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            </>
          )}
          {step === 1 && (
            <fieldset className="usage-choices">
              <legend className="sr-only">Utilisation de l’application</legend>
              {usageOptions.map(({ value, title, description, icon: Icon }) => (
                <label key={value} className="usage-card" data-selected={data.usageType === value}>
                  <input
                    type="radio"
                    name="usageType"
                    value={value}
                    checked={data.usageType === value}
                    onChange={() => field("usageType", value)}
                  />
                  <Icon size={25} />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  {data.usageType === value && <Check size={18} />}
                </label>
              ))}
            </fieldset>
          )}
          {step === 2 && (
            <>
              {data.usageType !== "PERSONAL" && (
                <label className="field">
                  <span>Nom de l’entreprise</span>
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    autoComplete="organization"
                    value={data.companyName}
                    onChange={(event) => field("companyName", event.target.value)}
                  />
                </label>
              )}
              <label className="field">
                <span>Devise principale</span>
                <select
                  value={data.currency}
                  onChange={(event) => field("currency", event.target.value)}
                >
                  {["EUR", "USD", "GBP", "MAD", "XOF", "XAF", "CAD", "CHF", "AED"].map(
                    (currency) => (
                      <option key={currency}>{currency}</option>
                    ),
                  )}
                </select>
              </label>
              <p className="muted">
                Les comptes et opérations de chaque espace utilisent leur propre devise. Les
                finances personnelles sont accessibles uniquement par vous.
              </p>
            </>
          )}
          {step === 3 && (
            <div className="free-choice">
              <span className="badge">FREE sélectionné</span>
              <h2>0 € / mois</h2>
              <p>Les fonctions essentielles pour commencer dès maintenant.</p>
              <ul>
                <li>Revenus, dépenses et suivi de trésorerie</li>
                <li>
                  {data.usageType === "PERSONAL"
                    ? "Comptes, catégories et budgets personnels"
                    : "Clients, factures et téléchargement PDF"}
                </li>
                <li>Mobile, tablette et ordinateur</li>
              </ul>
              <p className="muted">
                Vous pourrez découvrir PRO — 4 € / mois quand vous le souhaiterez.
              </p>
              <Link href="/pricing" target="_blank">
                Comparer les offres
              </Link>
            </div>
          )}
          <div className="onboarding-actions">
            {step > 0 && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={16} /> Retour
              </button>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Création du compte…" : step === 3 ? "Commencer gratuitement" : "Continuer"}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
        <p className="account-login-link">
          Déjà un compte ? <Link href="/login">Se connecter</Link>
        </p>
        <p className="muted account-privacy">
          En créant votre compte, vous prenez connaissance de notre{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
    </main>
  );
}
