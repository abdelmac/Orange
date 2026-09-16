"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Brand } from "./app-shell";
import { post } from "./api";

const subscribeHydration = () => () => {};

export function AuthForm({ mode = "login" }: { mode?: "login" | "forgot" | "reset" }) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (mode !== "login") return;
    const timer = setTimeout(() => {
      if (new URLSearchParams(window.location.search).has("passwordChanged"))
        setNotice(
          "Votre mot de passe a été modifié. Connectez-vous avec votre nouveau mot de passe.",
        );
    }, 0);
    return () => clearTimeout(timer);
  }, [mode]);
  const titles = {
    login: "Heureux de vous retrouver.",
    forgot: "Un nouveau départ.",
    reset: "Sécurisez votre accès.",
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "login") {
        await post("/api/auth/login", data);
        router.push("/");
        router.refresh();
      } else if (mode === "forgot") {
        await post("/api/auth/forgot-password", data);
        setSuccess(
          "Si un compte correspond à cette adresse, vous recevrez les instructions de réinitialisation par email.",
        );
      } else {
        const token = new URLSearchParams(window.location.search).get("token");
        await post("/api/auth/reset-password", { ...data, token });
        setSuccess("Votre mot de passe a été modifié. Vous pouvez vous connecter.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow light">UNE VISION CLAIRE. À CHAQUE INSTANT.</span>
          <h1>
            Votre entreprise.
            <br />
            Tout simplement,
            <br />
            <em>sous contrôle.</em>
          </h1>
          <p>
            Des ventes à la caisse, chaque mouvement compte. Pilotez votre activité avec une équipe
            connectée et une trésorerie transparente.
          </p>
          <div className="auth-benefits">
            {[
              "Une trésorerie précise, en temps réel",
              "Vos équipes réunies dans un seul espace",
              "Un historique fiable de chaque opération",
            ].map((t) => (
              <div key={t}>
                <Check size={17} />
                {t}
              </div>
            ))}
          </div>
        </div>
        <div className="auth-story-bottom">
          <ShieldCheck size={18} /> Vos données restent privées et sécurisées.
        </div>
        <div className="auth-orbit orbit-one" />
        <div className="auth-orbit orbit-two" />
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-card">
          <div className="auth-lock">
            <LockKeyhole size={25} />
          </div>
          <span className="eyebrow">VOTRE ESPACE DE GESTION</span>
          <h2>{titles[mode]}</h2>
          <p className="muted">
            {mode === "login"
              ? "Connectez-vous pour suivre l’essentiel de votre activité."
              : mode === "forgot"
                ? "Indiquez votre email professionnel pour réinitialiser votre mot de passe."
                : "Choisissez un mot de passe unique d’au moins 12 caractères."}
          </p>
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {success ? (
            <div className="alert success" role="status">
              {success}
              <Link href="/login">
                Retour à la connexion <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form method="post" onSubmit={submit}>
              {mode !== "reset" && (
                <label className="field">
                  <span>Adresse email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="vous@entreprise.fr"
                    required
                    autoFocus
                  />
                </label>
              )}
              {mode !== "forgot" && (
                <label className="field">
                  <span>{mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}</span>
                  <div className="password-input">
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      autoComplete={mode === "reset" ? "new-password" : "current-password"}
                      placeholder="Votre mot de passe"
                      minLength={mode === "reset" ? 12 : 1}
                      required
                    />
                    <button
                      type="button"
                      aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
              )}
              {mode === "login" && (
                <div className="forgot-link">
                  <Link href="/forgot-password">Mot de passe oublié ?</Link>
                </div>
              )}
              <button className="button primary auth-submit" disabled={busy || !hydrated}>
                {busy ? <span className="spinner small" /> : null}
                {mode === "login"
                  ? "Se connecter"
                  : mode === "forgot"
                    ? "Recevoir les instructions"
                    : "Enregistrer le mot de passe"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {mode !== "login" && !success && (
            <Link className="back-login" href="/login">
              Revenir à la connexion
            </Link>
          )}
          <div className="auth-security">
            <ShieldCheck size={15} /> Connexion sécurisée · Accès réservé à votre équipe
          </div>
          <nav
            aria-label="Aide et confidentialité"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 18,
              marginTop: 8,
              fontSize: 12,
              color: "#737b85",
            }}
          >
            <Link href="/assistance" style={{ paddingBlock: 12 }}>
              Assistance
            </Link>
            <Link href="/confidentialite" style={{ paddingBlock: 12 }}>
              Confidentialité
            </Link>
          </nav>
        </div>
        <div className="auth-copyright">
          Orange © {new Date().getFullYear()} · La clarté fait la différence.
        </div>
      </main>
    </div>
  );
}
