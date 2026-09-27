"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "./app-shell";
import { ThemePicker } from "./theme-picker";
import { api, post } from "./api";
import "./account-pages.css";
type Invitation = { email: string; companyName: string; roleLabel: string };
export function InvitationForm() {
  const router = useRouter();
  const [token, setToken] = useState(""),
    [invitation, setInvitation] = useState<Invitation | null>(null),
    [identity, setIdentity] = useState<{ email: string } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    void Promise.all([
      api<Invitation>(`/api/team/accept?token=${encodeURIComponent(value)}`),
      api<{ email: string }>("/api/account").catch(() => null),
    ])
      .then(([preview, user]) => {
        setToken(value);
        setInvitation(preview);
        setIdentity(user);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const login = `/login?next=${encodeURIComponent(`/invitation?token=${token}`)}`;
  return (
    <main className="account-page">
      <header className="account-public-header">
        <Brand />
        <ThemePicker />
      </header>
      <section className="account-card">
        <span className="eyebrow">INVITATION À REJOINDRE UNE ÉQUIPE</span>
        <h1>{invitation ? `Rejoindre ${invitation.companyName}` : "Votre invitation"}</h1>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {invitation && (
          <>
            <p>
              Invitation pour <strong>{invitation.email}</strong> · {invitation.roleLabel}
            </p>
            <p className="muted">
              Vos données personnelles restent privées. Seules les données de cette entreprise sont
              partagées.
            </p>
            {identity && identity.email !== invitation.email ? (
              <>
                <p>
                  Vous êtes connecté avec {identity.email}. Connectez-vous avec l’adresse invitée.
                </p>
                <button
                  className="button secondary"
                  onClick={async () => {
                    await post("/api/auth/logout", {});
                    router.push(login);
                    router.refresh();
                  }}
                >
                  Changer de compte
                </button>
              </>
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setError("");
                  const input = Object.fromEntries(new FormData(event.currentTarget));
                  try {
                    await post("/api/team/accept", { token, ...input });
                    router.push("/");
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Impossible d’accepter l’invitation.",
                    );
                    setBusy(false);
                  }
                }}
              >
                {!identity && (
                  <>
                    <p>
                      <Link href={login}>J’ai déjà un compte : me connecter</Link>
                    </p>
                    <p>Ou créez votre compte gratuitement :</p>
                    <label className="field">
                      <span>Votre nom</span>
                      <input
                        required
                        name="name"
                        autoComplete="name"
                        minLength={2}
                        maxLength={120}
                      />
                    </label>
                    <label className="field">
                      <span>Mot de passe · 12 caractères minimum</span>
                      <input
                        required
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                      />
                    </label>
                  </>
                )}
                <button className="button primary" disabled={busy}>
                  {busy ? "Acceptation…" : "Accepter l’invitation"}
                </button>
              </form>
            )}
          </>
        )}
        {!invitation && !error && <p>Chargement de l’invitation…</p>}
      </section>
    </main>
  );
}
