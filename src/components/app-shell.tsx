"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CirclePlus,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { api, post } from "./api";
import { Row, value } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { ThemeOptions, ThemePicker } from "./theme-picker";
import { useSidebarGesture } from "./use-sidebar-gesture";
import { APP_BRAND_NAME } from "@/lib/brand";

interface Session {
  user: Row;
  company: Row;
  permissions: string[];
  memberships: { companyId: string; name: string; isOwner: boolean }[];
  workspace: "BUSINESS" | "PERSONAL";
  can: (permission: string) => boolean;
}
const SessionContext = createContext<Session | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session indisponible");
  return session;
}
export const navigation = [
  {
    href: "/",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    permission: "",
    group: "VUE D’ENSEMBLE",
  },
  {
    href: "/saisie",
    label: "Saisie rapide",
    icon: CirclePlus,
    permission: "",
    group: "",
  },
  {
    href: "/journal",
    label: "Journal quotidien",
    icon: CalendarDays,
    permission: "transactions.view",
    group: "",
  },
  {
    href: "/caisse",
    label: "Caisses & trésorerie",
    icon: Wallet,
    permission: "cash.view",
    group: "",
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    permission: "transactions.view",
    group: "",
  },
  {
    href: "/ventes",
    label: "Ventes",
    icon: ShoppingBag,
    permission: "sales.view",
    group: "ACTIVITÉ COMMERCIALE",
  },
  { href: "/factures", label: "Factures", icon: FileText, permission: "invoices.view", group: "" },
  {
    href: "/encaissements",
    label: "Encaissements",
    icon: ArrowDownLeft,
    permission: "payments.view",
    group: "",
  },
  {
    href: "/depenses",
    label: "Dépenses",
    icon: CreditCard,
    permission: "expenses.view",
    group: "",
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
    permission: "clients.view",
    group: "VOTRE ENTREPRISE",
  },
  {
    href: "/commerciaux",
    label: "Commerciaux",
    icon: BriefcaseBusiness,
    permission: "salespeople.view",
    group: "",
  },
  {
    href: "/fournisseurs",
    label: "Fournisseurs",
    icon: UsersRound,
    permission: "suppliers.view",
    group: "",
  },
  {
    href: "/rapports",
    label: "Rapports",
    icon: BarChart3,
    permission: "reports.view",
    group: "PILOTAGE",
  },
  {
    href: "/utilisateurs",
    label: "Utilisateurs",
    icon: UsersRound,
    permission: "users.view",
    group: "",
  },
  {
    href: "/audit",
    label: "Journal d’audit",
    icon: ShieldCheck,
    permission: "audit.view",
    group: "",
  },
  { href: "/parametres", label: "Paramètres", icon: Settings2, permission: "", group: "" },
];
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label={`${APP_BRAND_NAME} accueil`}>
      <span className="brand-mark">
        <span />
      </span>
      <span>
        {APP_BRAND_NAME.toLowerCase()}
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}

const personalNavigation = [
  {
    href: "/personal",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    permission: "",
    group: "MES FINANCES PERSONNELLES",
  },
  {
    href: "/personal/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    permission: "",
    group: "",
  },
  { href: "/personal/depenses", label: "Dépenses", icon: CreditCard, permission: "", group: "" },
  { href: "/personal/revenus", label: "Revenus", icon: ArrowDownLeft, permission: "", group: "" },
  { href: "/personal/budgets", label: "Budgets", icon: CalendarDays, permission: "", group: "" },
  {
    href: "/personal/categories",
    label: "Catégories",
    icon: ShoppingBag,
    permission: "",
    group: "",
  },
  { href: "/personal/comptes", label: "Comptes", icon: Wallet, permission: "", group: "" },
  {
    href: "/personal/statistiques",
    label: "Statistiques",
    icon: BarChart3,
    permission: "",
    group: "",
  },
  { href: "/personal/parametres", label: "Paramètres", icon: Settings2, permission: "", group: "" },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(),
    pathname = usePathname();
  const [session, setSession] = useState<Omit<Session, "can"> | null>(null),
    [error, setError] = useState("");
  const [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState<Row[]>([]),
    [showNotifications, setShowNotifications] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Row[]>([]),
    [searching, setSearching] = useState(false);
  const { aside, compact } = useSidebarGesture(mobile, setMobile);
  const personal =
    pathname.startsWith("/personal") ||
    (pathname === "/abonnement" && session?.workspace === "PERSONAL");
  useEffect(() => {
    let alive = true;
    api<Omit<Session, "can" | "company"> & { company: Row | null }>("/api/me")
      .then((data) => {
        if (alive) {
          setSession({ ...data, company: data.company ?? {} });
          if (!data.company && !personal && pathname !== "/abonnement") router.replace("/personal");
          if (personal && data.user.usageType === "BUSINESS") router.replace("/onboarding");
        }
      })
      .catch((error) => {
        if (alive) {
          setError(error.message);
          router.replace("/login");
        }
      });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      alive = false;
    };
  }, [router, personal, pathname]);
  useEffect(() => {
    if (!session || personal || session.workspace === "PERSONAL") return;
    api<{ items: Row[] }>("/api/notifications")
      .then((data) => setNotifications(data.items))
      .catch(() => {});
  }, [session, personal]);
  useEffect(() => {
    if (personal || query.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      api<{ items: Row[] }>(`/api/search?q=${encodeURIComponent(query)}`)
        .then((data) => {
          if (active) setResults(data.items);
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, personal]);
  const can = useCallback(
    (permission: string) =>
      !permission ||
      Boolean(session?.permissions.includes(permission) || session?.permissions.includes("*")),
    [session?.permissions],
  );
  if (!session)
    return (
      <div className="screen-loading">
        <Brand />
        <span className="spinner" />
        <p>{error || "Ouverture de votre espace…"}</p>
      </div>
    );
  const activeNavigation = personal ? personalNavigation : navigation;
  const visible = activeNavigation.filter((item) =>
    item.href === "/saisie"
      ? can("expenses.create") ||
        (session.user.role === "SALESPERSON" ? can("payments.create") : can("cash.deposit"))
      : can(item.permission),
  );
  const title = activeNavigation.find((item) => item.href === pathname)?.label || "Votre espace";
  const mobileLinks = (
    personal
      ? ["/personal", "/personal/transactions", "/personal/depenses", "/personal/budgets"]
      : ["/", "/journal", "/saisie", "/depenses"]
  )
    .map((href) => visible.find((item) => item.href === href))
    .filter((item) => item !== undefined);
  const initials = value(session.user, "name", "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
  return (
    <SessionContext.Provider value={{ ...session, can }}>
      <div className="app-shell">
        {mobile && (
          <button
            className="sidebar-overlay"
            aria-label="Fermer le menu"
            onClick={() => setMobile(false)}
          />
        )}
        <aside
          ref={aside}
          id="main-sidebar"
          className={`sidebar ${mobile ? "is-open" : ""}`}
          inert={compact && !mobile}
          role={compact && mobile ? "dialog" : undefined}
          aria-modal={compact && mobile ? true : undefined}
          aria-label="Menu de navigation"
        >
          <div className="sidebar-brand">
            <Brand />
            <button
              className="icon-button mobile-only"
              onClick={() => setMobile(false)}
              aria-label="Fermer"
            >
              <X size={20} />
            </button>
          </div>
          <label className="workspace-selector">
            <span>Votre espace</span>
            <select
              aria-label="Changer d’espace"
              value={personal ? "personal" : value(session.company, "id", "personal")}
              onChange={async (event) => {
                try {
                  const result = await post<{ redirectTo: string }>("/api/workspace", {
                    companyId: event.target.value === "personal" ? null : event.target.value,
                  });
                  window.location.assign(result.redirectTo);
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Changement impossible.");
                }
              }}
            >
              {session.user.usageType !== "BUSINESS" && (
                <option value="personal">Mes finances personnelles</option>
              )}
              {session.memberships.map((member) => (
                <option key={member.companyId} value={member.companyId}>
                  {member.name} · Entreprise
                </option>
              ))}
            </select>
            {error && <small role="alert">{error}</small>}
          </label>
          <section className="sidebar-appearance" aria-label="Apparence">
            <h2>Apparence</h2>
            <ThemeOptions />
          </section>
          <nav className="side-nav" aria-label="Navigation principale">
            {visible.map((item) => (
              <div key={item.href}>
                {item.group && <div className="nav-group">{item.group}</div>}
                <Link
                  href={item.href}
                  onClick={() => setMobile(false)}
                  className={`nav-link ${pathname === item.href ? "active" : ""}`}
                >
                  <item.icon size={18} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  {pathname === item.href && <span className="nav-active-dot" />}
                </Link>
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="secure-note">
              <ShieldCheck size={18} />
              <span>
                Votre activité, en confiance.<small>Des opérations toujours traçables</small>
              </span>
            </div>
            <button
              className="profile"
              onClick={() => router.push(personal ? "/personal/parametres" : "/parametres")}
            >
              <span className="avatar">{initials}</span>
              <span>
                <strong>{value(session.user, "name")}</strong>
                <small>{translate(session.user.role)}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-only"
                aria-label="Ouvrir le menu"
                aria-controls="main-sidebar"
                aria-expanded={mobile}
                onClick={() => setMobile(true)}
              >
                <Menu size={22} />
              </button>
              <span className="desktop-only">Mon espace</span>
              <ChevronRight className="desktop-only" size={14} />
              <strong>{title}</strong>
            </div>
            <div className="topbar-tools">
              {!personal && (
                <>
                  <button
                    className="icon-button mobile-search-toggle"
                    aria-label="Rechercher"
                    aria-expanded={mobileSearch}
                    onClick={() => setMobileSearch(!mobileSearch)}
                  >
                    <Search size={19} />
                  </button>
                  <div className={`global-search ${mobileSearch ? "mobile-search-open" : ""}`}>
                    <Search size={17} />
                    <input
                      aria-label="Recherche globale"
                      placeholder="Rechercher dans votre entreprise…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query.trim().length >= 2 && (
                      <div className="search-results">
                        <div className="dropdown-heading">
                          {searching ? "Recherche…" : "Résultats de recherche"}
                          <button
                            className="icon-button"
                            onClick={() => {
                              setQuery("");
                              setMobileSearch(false);
                            }}
                            aria-label="Fermer la recherche"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        {results.length ? (
                          results.map((item, index) => (
                            <Link
                              key={value(item, "id", String(index))}
                              href={value(item, "href", "/transactions")}
                              onClick={() => setQuery("")}
                            >
                              <Search size={16} />
                              <div>
                                <strong>
                                  {value(item, "label", value(item, "name", value(item, "number")))}
                                </strong>
                                <small>{value(item, "type", "")}</small>
                              </div>
                              <ChevronRight size={15} />
                            </Link>
                          ))
                        ) : (
                          <p className="muted">
                            {searching
                              ? "Recherche en cours…"
                              : "Aucun résultat pour cette recherche."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              <ThemePicker />
              <div className="notification-wrap">
                <button
                  className="icon-button notification-button"
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                  onClick={() => setShowNotifications(!showNotifications)}
                >
                  <Bell size={20} />
                  {notifications.some((n) => !n.readAt) && <i />}
                </button>
                {showNotifications && (
                  <div className="notification-panel">
                    <div className="dropdown-heading">
                      Notifications <span className="count">{notifications.length}</span>
                    </div>
                    {notifications.length ? (
                      notifications.slice(0, 10).map((n) => (
                        <div className="notification-item" key={value(n, "id")}>
                          <span className="notification-icon">
                            <Bell size={16} />
                          </span>
                          <div>
                            <strong>{value(n, "title", value(n, "message"))}</strong>
                            {Boolean(n.title) && <p>{value(n, "message", "")}</p>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-small">
                        Vous êtes à jour.
                        <br />
                        <small>Vos prochaines notifications apparaîtront ici.</small>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="topbar-divider" />
              <span className="avatar avatar-small">{initials}</span>
              <button
                className="icon-button"
                title="Déconnexion"
                aria-label="Déconnexion"
                onClick={async () => {
                  await post("/api/auth/logout", {});
                  router.replace("/login");
                  router.refresh();
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          </header>
          <main className="main-content">
            {!personal && session.workspace === "PERSONAL" && pathname !== "/abonnement" ? (
              <p>Ouverture de votre espace personnel…</p>
            ) : (
              children
            )}
          </main>
          <footer className="app-footer">
            <span>
              © {new Date().getFullYear()} {APP_BRAND_NAME} ·{" "}
              {personal ? "Finances personnelles" : "Gestion d’entreprise"}
            </span>
            <span>
              <span className="live-dot" /> Espace sécurisé
            </span>
          </footer>
        </div>
        <nav
          className="mobile-bottom-nav"
          data-workspace={personal ? "PERSONAL" : "BUSINESS"}
          aria-label="Navigation mobile"
        >
          {mobileLinks.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`${pathname === n.href ? "active" : ""} ${n.href === "/saisie" ? "mobile-quick-entry" : ""}`}
              aria-label={n.href === "/saisie" ? "Saisie rapide" : undefined}
              aria-current={pathname === n.href ? "page" : undefined}
            >
              <span
                className={n.href === "/saisie" ? "mobile-quick-entry-icon" : "mobile-nav-icon"}
              >
                <n.icon size={22} aria-hidden="true" />
              </span>
              <span>
                {n.href === "/"
                  ? "Accueil"
                  : n.href === "/saisie"
                    ? "Saisir"
                    : n.href === "/journal"
                      ? "Journal"
                      : n.label}
              </span>
            </Link>
          ))}
          <button onClick={() => setMobile(true)} aria-expanded={mobile}>
            <Menu size={21} />
            <span>Menu</span>
          </button>
        </nav>
      </div>
    </SessionContext.Provider>
  );
}
