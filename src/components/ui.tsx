"use client";
import { useEffect, useRef } from "react";
import { CheckCircle2, CircleAlert, Inbox, X } from "lucide-react";
import { translate } from "@/lib/i18n";

export function Badge({ status }: { status: unknown }) {
  return (
    <span className={`badge status-${String(status).toLowerCase()}`}>{translate(status)}</span>
  );
}
export function Empty({
  title = "Rien à afficher pour le moment",
  description = "Les opérations enregistrées apparaîtront ici.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <span>
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-area">
      <span className="spinner" />
      <p>Chargement de votre activité…</p>
    </div>
  );
}
export function ErrorMessage({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="alert error" role="alert">
      <CircleAlert size={18} />
      <span>{message}</span>
      {retry && <button onClick={retry}>Réessayer</button>}
    </div>
  );
}
export function Toast({ message, clear }: { message: string; clear: () => void }) {
  useEffect(() => {
    const timer = setTimeout(clear, 5000);
    return () => clearTimeout(timer);
  }, [clear]);
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={20} />
      {message}
      <button aria-label="Fermer" onClick={clear}>
        <X size={16} />
      </button>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fermer la fenêtre">
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function PeriodFilter({
  period,
  change,
  from,
  to,
  setFrom,
  setTo,
}: {
  period: string;
  change: (v: string) => void;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="period-filter">
      <select aria-label="Période" value={period} onChange={(e) => change(e.target.value)}>
        <option value="today">Aujourd’hui</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="month">Ce mois-ci</option>
        <option value="last-month">Mois précédent</option>
        <option value="year">Cette année</option>
        <option value="custom">Période personnalisée</option>
      </select>
      {period === "custom" && (
        <>
          <input
            aria-label="Date de début"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>au</span>
          <input
            aria-label="Date de fin"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </>
      )}
    </div>
  );
}
