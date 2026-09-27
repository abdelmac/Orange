"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, post } from "./api";
type Identity = {
  name: string;
  email: string;
  usageType: string;
  memberships: { companyId: string; name: string }[];
};
export function AccountProfile({ identity }: { identity: Identity }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function update(input: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify(input) });
      setNotice("Votre profil a été mis à jour.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="account-profile">
      <summary>Mon profil et mes espaces</summary>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void update(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        <label className="field">
          <span>Votre nom</span>
          <input name="name" defaultValue={identity.name} minLength={2} maxLength={120} required />
        </label>
        <p className="muted">Email : {identity.email}</p>
        <button className="button secondary" disabled={busy}>
          Enregistrer mon nom
        </button>
      </form>
      {identity.usageType === "BUSINESS" && (
        <section>
          <h2>Mes finances personnelles</h2>
          <p className="muted">Ajoutez gratuitement un espace privé, séparé de votre entreprise.</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void update({ enablePersonal: true })}
          >
            Activer mon espace personnel
          </button>
        </section>
      )}
      {identity.memberships.length > 0 && (
        <section>
          <h2>Mes entreprises</h2>
          <div className="welcome-actions">
            {identity.memberships.map((membership) => (
              <button
                key={membership.companyId}
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await post("/api/workspace", { companyId: membership.companyId });
                    router.push("/");
                    router.refresh();
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Changement impossible.");
                    setBusy(false);
                  }
                }}
              >
                {membership.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {identity.usageType !== "BUSINESS" && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await post("/api/workspace", { companyId: null });
              router.push("/personal");
              router.refresh();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Changement impossible.");
              setBusy(false);
            }
          }}
        >
          Ouvrir mon espace personnel
        </button>
      )}
      <section>
        <h2>Créer un espace entreprise</h2>
        <p className="muted">Démarrez avec FREE, sans carte bancaire.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void update(Object.fromEntries(new FormData(event.currentTarget)));
          }}
        >
          <label className="field">
            <span>Nom de l’entreprise</span>
            <input name="companyName" minLength={2} maxLength={200} required />
          </label>
          <button className="button secondary" disabled={busy}>
            Créer mon entreprise
          </button>
        </form>
      </section>
    </details>
  );
}
