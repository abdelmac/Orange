"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MailPlus, ShieldCheck, UsersRound } from "lucide-react";
import { api, post } from "./api";
import "./account-pages.css";

type Override = { permissionKey: string; allowed: boolean };
type Member = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  isOwner: boolean;
  role: string;
  permissions: Override[];
};
type Invitation = {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  role: { name: string; label: string };
};
type Team = {
  members: Member[];
  invitations: Invitation[];
  entitlement: { features: string[]; limits: { maxTeamMembers: number | null } };
  roleLabels: Record<string, string>;
  permissionDefinitions: string[];
  rolePermissions: Record<string, string[]>;
};
const sections: Record<string, string> = {
  dashboard: "Tableau de bord",
  clients: "Clients",
  suppliers: "Fournisseurs",
  salespeople: "Commerciaux",
  sales: "Ventes",
  invoices: "Factures",
  payments: "Paiements",
  expenses: "Dépenses",
  cash: "Caisses",
  transactions: "Transactions",
  users: "Utilisateurs",
  reports: "Rapports",
  audit: "Audit",
  settings: "Paramètres",
  attachments: "Justificatifs",
};
const actions: Record<string, string> = {
  view: "Consulter",
  create: "Créer",
  edit: "Modifier",
  validate: "Valider",
  reject: "Refuser",
  pay: "Payer",
  deposit: "Encaisser",
  withdraw: "Décaisser",
  transfer: "Transférer",
  handover: "Remettre",
  adjust: "Ajuster",
  reverse: "Annuler",
  export: "Exporter",
};
function permissionLabel(key: string) {
  const [section, action] = key.split(".");
  return `${sections[section] ?? section} · ${actions[action] ?? action}`;
}

function MemberCard({
  member,
  team,
  run,
  busy,
}: {
  member: Member;
  team: Team;
  run: (work: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [role, setRole] = useState(member.role);
  const [overrides, setOverrides] = useState(member.permissions);
  const enabled = (key: string) =>
    overrides.find((item) => item.permissionKey === key)?.allowed ??
    team.rolePermissions[role]?.includes(key) ??
    false;
  const premium = team.entitlement.features.includes("teams");
  return (
    <article className="team-member">
      <header className="team-member-header">
        <div>
          <strong>{member.name}</strong>
          <p className="muted">{member.email}</p>
        </div>
        <span className="badge">
          {member.isOwner
            ? "Propriétaire"
            : member.active
              ? team.roleLabels[member.role]
              : "Accès retiré"}
        </span>
      </header>
      {!member.isOwner && (
        <>
          <div className="team-member-actions">
            <select
              aria-label={`Rôle de ${member.name}`}
              value={role}
              disabled={!premium || busy}
              onChange={(event) => {
                setRole(event.target.value);
                setOverrides([]);
              }}
            >
              {Object.entries(team.roleLabels)
                .filter(([name]) => name !== "OWNER")
                .map(([name, label]) => (
                  <option key={name} value={name}>
                    {label}
                  </option>
                ))}
            </select>
            <button
              className="button secondary"
              disabled={!premium || busy}
              onClick={() =>
                void run(() =>
                  api(`/api/team/members/${member.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ role, permissions: overrides }),
                  }),
                )
              }
            >
              Enregistrer les droits
            </button>
            <button
              className="button secondary"
              disabled={busy || (!premium && !member.active)}
              onClick={() => {
                if (
                  window.confirm(
                    member.active
                      ? `Retirer l’accès de ${member.name} à cette entreprise ? Son historique sera conservé.`
                      : `Rétablir l’accès de ${member.name} ?`,
                  )
                )
                  void run(() =>
                    api(`/api/team/members/${member.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ active: !member.active }),
                    }),
                  );
              }}
            >
              {member.active ? "Retirer l’accès" : "Rétablir l’accès"}
            </button>
          </div>
          <details>
            <summary style={{ paddingBlock: 16, cursor: "pointer" }}>
              Personnaliser les permissions
            </summary>
            <p className="muted">
              Les règles de confidentialité et les actions réservées au propriétaire restent
              toujours appliquées.
            </p>
            <div className="team-permissions">
              {team.permissionDefinitions.map((key) => (
                <label className="team-permission" key={key}>
                  <input
                    type="checkbox"
                    disabled={!premium || busy}
                    checked={enabled(key)}
                    onChange={(event) =>
                      setOverrides([
                        ...overrides.filter((item) => item.permissionKey !== key),
                        { permissionKey: key, allowed: event.target.checked },
                      ])
                    }
                  />
                  <span>{permissionLabel(key)}</span>
                </label>
              ))}
            </div>
          </details>
        </>
      )}
    </article>
  );
}

export function TeamPage() {
  const [team, setTeam] = useState<Team | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setTeam(await api<Team>("/api/team"));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void api<Team>("/api/team")
      .then((result) => {
        if (!cancelled) setTeam(result);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice("Les modifications ont été enregistrées.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }
  const premium = team?.entitlement.features.includes("teams");
  return (
    <div className="page-content team-content">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PARAMÈTRES</span>
          <h1>Votre équipe</h1>
          <p className="muted">
            Invitez des collaborateurs et choisissez leurs accès à votre entreprise.
          </p>
        </div>
        <UsersRound size={28} />
      </header>
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
      {!team && !error && <p>Chargement de l’équipe…</p>}
      {team && (
        <>
          {!premium && (
            <section className="panel">
              <ShieldCheck size={24} />
              <h2>Travaillez ensemble avec PRO</h2>
              <p>
                Les invitations et la personnalisation des permissions sont disponibles avec PRO — 4
                € / mois.
              </p>
              <Link href="/pricing" className="button primary">
                Découvrir PRO
              </Link>
            </section>
          )}
          <section className="panel">
            <h2>Inviter un membre</h2>
            <p className="muted">
              {team.entitlement.limits.maxTeamMembers === null
                ? "Votre offre conserve les accès de votre équipe existante."
                : `Jusqu’à ${team.entitlement.limits.maxTeamMembers} membres, propriétaire inclus.`}{" "}
              L’invitation est valable 7 jours.
            </p>
            <form
              className="team-invite-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = Object.fromEntries(new FormData(form));
                void run(async () => {
                  await post("/api/team", data);
                  form.reset();
                });
              }}
            >
              <label className="field">
                <span>Adresse email</span>
                <input
                  required
                  type="email"
                  name="email"
                  disabled={!premium || busy}
                  placeholder="collaborateur@entreprise.fr"
                />
              </label>
              <label className="field">
                <span>Rôle</span>
                <select name="role" defaultValue="MEMBER" disabled={!premium || busy}>
                  {Object.entries(team.roleLabels)
                    .filter(([name]) => name !== "OWNER")
                    .map(([name, label]) => (
                      <option value={name} key={name}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <button className="button primary" disabled={!premium || busy}>
                <MailPlus size={16} /> Inviter
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Membres ({team.members.filter((member) => member.active).length})</h2>
            <div className="team-members">
              {team.members.map((member) => (
                <MemberCard
                  key={`${member.id}:${member.role}:${JSON.stringify(member.permissions)}:${member.active}`}
                  member={member}
                  team={team}
                  run={run}
                  busy={busy}
                />
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Invitations en attente</h2>
            {!team.invitations.length && <p className="muted">Aucune invitation en attente.</p>}
            {team.invitations.map((invitation) => (
              <article className="team-member" key={invitation.id}>
                <strong>{invitation.email}</strong>
                <p className="muted">
                  {invitation.role.label} ·{" "}
                  {invitation.status === "EXPIRED"
                    ? "Expirée"
                    : `Valable jusqu’au ${new Date(invitation.expiresAt).toLocaleDateString("fr-FR")}`}
                </p>
                <div className="team-member-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !premium}
                    onClick={() =>
                      void run(() =>
                        post(`/api/team/invitations/${invitation.id}`, {
                          email: invitation.email,
                          role: invitation.role.name,
                        }),
                      )
                    }
                  >
                    Renvoyer
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Annuler cette invitation ?"))
                        void run(() =>
                          api(`/api/team/invitations/${invitation.id}`, { method: "DELETE" }),
                        );
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
