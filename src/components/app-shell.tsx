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
  ChevronDown,
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

interface Session {
  user: Row;
  company: Row;
  permissions: string[];
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
    <Link className="brand" href="/" aria-label="Orange accueil">
      <span className="brand-mark">
        <span />
      </span>
      <span>
        orange<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}

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
  useEffect(() => {
    let alive = true;
    api<Omit<Session, "can">>("/api/me")
      .then((data) => {
        if (alive) setSession(data);
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
  }, [router]);
  useEffect(() => {
    if (!session) return;
    api<{ items: Row[] }>("/api/notifications")
      .then((data) => setNotifications(data.items))
      .catch(() => {});
  }, [session]);
  useEffect(() => {
    if (query.trim().length < 2) return;
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
  }, [query]);
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
  const visible = navigation.filter((item) => can(item.permission));
  const title = navigation.find((item) => item.href === pathname)?.label || "Votre espace";
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
        <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
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
          <div className="company-switch">
            <div className="company-avatar">{value(session.company, "name", "E")[0]}</div>
            <div>
              <strong>{value(session.company, "name")}</strong>
              <span>Espace entreprise</span>
            </div>
            <ChevronDown size={14} />
          </div>
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
            <button className="profile" onClick={() => router.push("/parametres")}>
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
                onClick={() => setMobile(true)}
              >
                <Menu size={22} />
              </button>
              <span className="desktop-only">Mon espace</span>
              <ChevronRight className="desktop-only" size={14} />
              <strong>{title}</strong>
            </div>
            <div className="topbar-tools">
              <button
                className="icon-button mobile-search-toggle"
                aria-label="Rechercher"
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
                <kbd>⌕</kbd>
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
                        {searching ? "Recherche en cours…" : "Aucun résultat pour cette recherche."}
                      </p>
                    )}
                  </div>
                )}
              </div>
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
          <main className="main-content">{children}</main>
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} Orange · Gestion d’entreprise</span>
            <span>
              <span className="live-dot" /> Espace sécurisé
            </span>
          </footer>
        </div>
        <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
          {visible
            .filter((n) => ["/", "/encaissements", "/depenses", "/clients"].includes(n.href))
            .map((n) => (
              <Link key={n.href} href={n.href} className={pathname === n.href ? "active" : ""}>
                <n.icon size={21} />
                <span>{n.href === "/" ? "Accueil" : n.label}</span>
              </Link>
            ))}
          <button onClick={() => setMobile(true)}>
            <Menu size={21} />
            <span>Menu</span>
          </button>
        </nav>
      </div>
    </SessionContext.Provider>
  );
}
