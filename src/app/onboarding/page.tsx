import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { Brand } from "@/components/app-shell";
import { ThemePicker } from "@/components/theme-picker";
import { AccountProfile } from "@/components/account-profile";
import "@/components/account-pages.css";
export default async function Page() {
  const identity = await getIdentity().catch((error) => {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    throw error;
  });
  const personal = identity.usageType === "PERSONAL";
  return (
    <main className="account-page">
      <header className="account-public-header">
        <Brand />
        <ThemePicker />
      </header>
      <section className="account-card">
        <span className="badge">Compte gratuit activé</span>
        <h1>Bienvenue, {identity.name}.</h1>
        <p>
          Votre espace {personal ? "personnel" : "entreprise"} est prêt. Choisissez une première
          action.
        </p>
        <div className="welcome-actions">
          {(personal
            ? [
                ["/personal/depenses", "Ajouter une première dépense"],
                ["/personal/revenus", "Ajouter un revenu"],
                ["/personal/budgets", "Créer un budget"],
              ]
            : [
                ["/factures", "Créer une première facture"],
                ["/clients", "Ajouter un client"],
                ["/saisie", "Enregistrer un revenu ou une dépense"],
              ]
          ).map(([href, label]) => (
            <Link className="button secondary" key={href} href={href}>
              {label}
            </Link>
          ))}
        </div>
        {identity.usageType === "BOTH" && (
          <p className="muted">
            Votre espace personnel est également disponible dans le sélecteur d’espace. Vos données
            personnelles sont privées, même pour les administrateurs de votre entreprise.
          </p>
        )}
        <Link className="button primary" href={personal ? "/personal" : "/"}>
          Ouvrir mon tableau de bord
        </Link>
        <p className="account-login-link">
          <Link href="/pricing">Découvrir PRO — 4 € / mois</Link>
        </p>
        <AccountProfile identity={identity} />
      </section>
    </main>
  );
}
