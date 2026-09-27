"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Crown, CreditCard, RefreshCw } from "lucide-react";
import { api, post } from "./api";
import { ErrorMessage } from "./ui";
import { date } from "@/lib/format";
import { APP_BRAND_NAME, APP_NAME } from "@/lib/brand";

type Billing = {
  plan: { code: string; name: string };
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  canManage: boolean;
  configured: boolean;
  hasCustomer: boolean;
  scope: string;
};
export function Subscription() {
  const [data, setData] = useState<Billing | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [native, setNative] = useState(false);
  const load = () => api<Billing>("/api/billing").then(setData);
  useEffect(() => {
    let alive = true;
    api<Billing>("/api/billing")
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    const frame = requestAnimationFrame(() =>
      setNative(navigator.userAgent.includes("OrangeFinanceNative")),
    );
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, []);
  async function action(kind: string) {
    if (
      kind === "cancel" &&
      !confirm(
        "Désactiver le renouvellement ? PRO reste disponible jusqu’à la fin de votre période payée.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post<{ url?: string; message?: string }>(`/api/billing/${kind}`, {});
      if (result.url) window.location.assign(result.url);
      else {
        setMessage(result.message ?? "Demande enregistrée.");
        await load();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VOTRE OFFRE</div>
          <h1>Mon abonnement</h1>
          <p>Des outils adaptés à votre activité, sans perdre vos données.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => load().catch((error) => setError(error.message))}
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>
      {error && <ErrorMessage message={error} />}
      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}
      {!data ? (
        <p>Chargement de votre abonnement…</p>
      ) : (
        <>
          <section className="card settings-card">
            <h2>Offre actuelle : {data.plan.name}</h2>
            <p>
              {data.scope === "BUSINESS"
                ? "Abonnement de l’entreprise sélectionnée."
                : "Abonnement de votre espace personnel."}
            </p>
            {data.plan.code === "LEGACY" && (
              <p>
                Les fonctionnalités de votre entreprise existante sont conservées. PRO ajoute la
                personnalisation des factures.
              </p>
            )}
            {data.status === "PAST_DUE" && (
              <div className="alert error">
                Le paiement n’a pas abouti. Les fonctions PRO sont suspendues ; vos données restent
                accessibles. Mettez votre moyen de paiement à jour dans le portail.
              </div>
            )}
            {data.currentPeriodEnd && (
              <p>
                {data.cancelAtPeriodEnd ? "Fin de l’accès PRO" : "Fin de période"} :{" "}
                <strong>{date(data.currentPeriodEnd)}</strong>.
              </p>
            )}
            <p className="muted">
              Après le paiement, l’activation peut prendre quelques instants. Utilisez Actualiser
              pour vérifier votre offre.
            </p>
            {!data.canManage && (
              <p>Seul le propriétaire de l’entreprise peut modifier cet abonnement.</p>
            )}
            {native ? (
              <p>La gestion des achats n’est pas disponible dans cette version mobile.</p>
            ) : (
              data.canManage && (
                <div className="billing-actions">
                  {data.hasCustomer && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => action("portal")}
                    >
                      <CreditCard size={17} />
                      Factures et moyen de paiement
                    </button>
                  )}
                  {data.status === "ACTIVE" && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => action(data.cancelAtPeriodEnd ? "resume" : "cancel")}
                    >
                      {data.cancelAtPeriodEnd
                        ? "Réactiver le renouvellement"
                        : "Résilier à la fin de la période"}
                    </button>
                  )}
                </div>
              )
            )}
          </section>
          <div className="pricing-grid">
            <PlanCard pro={false} />
            <PlanCard pro>
              {data.plan.code === "PRO" ? (
                <span className="badge status-paid">Votre offre actuelle</span>
              ) : native ? null : (
                <>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !data.canManage ||
                      !data.configured ||
                      data.status === "PAST_DUE" ||
                      data.scope === "PERSONAL"
                    }
                    onClick={() => action("checkout")}
                  >
                    <Crown size={17} />
                    {busy ? "Ouverture…" : "Passer à PRO"}
                  </button>
                  {data.scope === "PERSONAL" && (
                    <p>
                      PRO ajoute des outils pour l’entreprise. Activez un espace entreprise depuis
                      vos paramètres pour en profiter.
                    </p>
                  )}
                  {!data.configured && data.canManage && (
                    <p className="muted">
                      Le paiement n’est pas encore disponible. Votre offre FREE reste utilisable.
                    </p>
                  )}
                </>
              )}
            </PlanCard>
          </div>
        </>
      )}
    </>
  );
}
export function PlanCard({ pro, children }: { pro: boolean; children?: React.ReactNode }) {
  const features = pro
    ? [
        "Toutes les fonctions FREE",
        "Factures : logo, couleurs et modèles",
        `Suppression de la mention ${APP_BRAND_NAME}`,
        "Équipe jusqu’à 25 membres",
        "Permissions individuelles",
        "Rapports avancés",
      ]
    : [
        "Clients et factures sans quota",
        "Encaissements, dépenses et caisses",
        `Factures PDF avec mention ${APP_BRAND_NAME}`,
        "Budgets et comptes personnels",
        "Tableau de bord et rapports simples",
        "Un utilisateur par entreprise",
      ];
  return (
    <section className={`card plan-card ${pro ? "plan-pro" : ""}`}>
      <div className="eyebrow">{pro ? "POUR VOTRE ÉQUIPE" : "POUR COMMENCER"}</div>
      <h2>{pro ? "PRO" : "FREE"}</h2>
      <p className="plan-price">
        {pro ? "4 €" : "0 €"}
        <small>/ mois</small>
      </p>
      <ul>
        {features.map((feature) => (
          <li key={feature}>
            <Check size={17} />
            {feature}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}
export function PublicPricing() {
  return (
    <main className="pricing-page">
      <Link href="/login" className="button secondary">
        Connexion
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{APP_NAME.toUpperCase()}</div>
          <h1>Commencez gratuitement.</h1>
          <p>Choisissez votre espace : entreprise, personnel ou les deux.</p>
        </div>
      </div>
      <div className="pricing-grid">
        <PlanCard pro={false}>
          <Link href="/inscription" className="button secondary">
            Créer mon compte FREE
          </Link>
        </PlanCard>
        <PlanCard pro>
          <Link href="/abonnement" className="button primary">
            Choisir PRO
          </Link>
          <p className="muted">
            4 EUR par mois pour l’entreprise. Renouvellement automatique, résiliation à la fin de la
            période payée.
          </p>
        </PlanCard>
      </div>
    </main>
  );
}
