import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import styles from "./public-info.module.css";

export const SUPPORT_EMAIL = "ennearock@gmail.com";

export function PublicInfo({
  current,
  eyebrow,
  title,
  description,
  children,
}: {
  current: "assistance" | "confidentialite";
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/login" aria-label="Orange Finance, connexion">
          <Image src="/icon.svg" alt="" width={38} height={38} />
          <span>
            Orange <strong>Finance</strong>
          </span>
        </Link>
        <Link className={styles.login} href="/login">
          <ArrowLeft size={16} aria-hidden="true" /> Connexion
        </Link>
      </header>
      <main className={styles.main}>
        <nav className={styles.navigation} aria-label="Informations publiques">
          <Link href="/assistance" aria-current={current === "assistance" ? "page" : undefined}>
            Assistance
          </Link>
          <Link
            href="/confidentialite"
            aria-current={current === "confidentialite" ? "page" : undefined}
          >
            Confidentialité
          </Link>
        </nav>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.content}>{children}</div>
      </main>
      <footer className={styles.footer}>
        <span>Orange Finance · Informations mises à jour le 16 septembre 2026</span>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </footer>
    </div>
  );
}

export function InfoSection({
  id,
  title,
  icon,
  children,
  highlight = false,
}: {
  id?: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  highlight?: boolean;
}) {
  return (
    <section id={id} className={`${styles.section} ${highlight ? styles.highlight : ""}`}>
      <h2>
        {icon}
        <span>{title}</span>
      </h2>
      {children}
    </section>
  );
}

export function SupportLink({ subject, children }: { subject: string; children: ReactNode }) {
  return (
    <a
      className={styles.contact}
      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`}
    >
      {children} <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  );
}
