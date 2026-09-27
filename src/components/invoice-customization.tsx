"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Eye, FileText, Plus, Save, Trash2 } from "lucide-react";
import { APP_BRAND_NAME } from "@/lib/brand";
import {
  defaultInvoiceSettings,
  formatInvoiceNumber,
  invoiceCustomizationInput,
  type InvoiceCustomizationSettings,
  type InvoiceIssuer,
} from "@/lib/invoice-customization";
import { api } from "./api";
import { useSession } from "./app-shell";
import { ErrorMessage, Loading } from "./ui";
import "./invoice-customization.css";

type SettingsResponse = {
  settings: InvoiceCustomizationSettings;
  company: InvoiceIssuer;
  hasLogo: boolean;
  canCustomize: boolean;
};
type TextKey =
  | "displayName"
  | "address"
  | "phone"
  | "email"
  | "taxNumber"
  | "legalInformation"
  | "bankDetails"
  | "headerText"
  | "footerText"
  | "terms"
  | "thankYou"
  | "defaultNotes"
  | "prefix";

export function InvoiceCustomization() {
  const { can } = useSession();
  const allowed = can("settings.edit");
  const [loaded, setLoaded] = useState<SettingsResponse | null>(null);
  const [settings, setSettings] = useState<InvoiceCustomizationSettings>(
    defaultInvoiceSettings("EUR"),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [logoVersion, setLogoVersion] = useState(0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const blobUrl = useRef("");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<SettingsResponse>("/api/invoice-customization")
      .then((result) => {
        if (!active) return;
        setLoaded(result);
        setSettings(result.settings);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [allowed]);

  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const parsed = invoiceCustomizationInput.safeParse(settings);
      if (!parsed.success) {
        setPreviewError("Complétez les champs pour actualiser l’aperçu.");
        return;
      }
      try {
        const response = await fetch("/api/invoice-customization/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error((await response.json()).error || "Aperçu indisponible.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const next = URL.createObjectURL(blob);
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = next;
        setPreviewUrl(next);
        setPreviewError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setPreviewError(e instanceof Error ? e.message : "Aperçu indisponible.");
      }
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loaded, settings, logoVersion]);

  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );

  function change<K extends keyof InvoiceCustomizationSettings>(
    key: K,
    next: InvoiceCustomizationSettings[K],
  ) {
    setMessage("");
    setSettings((current) => ({ ...current, [key]: next }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const validated = invoiceCustomizationInput.parse(settings);
      await api("/api/invoice-customization", { method: "PUT", body: JSON.stringify(validated) });
      setMessage("Personnalisation enregistrée. Elle sera appliquée aux prochaines factures.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function logo(file: File | null) {
    setError("");
    setBusy(true);
    try {
      if (file && (file.size > 1_000_000 || !["image/png", "image/jpeg"].includes(file.type)))
        throw new Error("Choisissez un logo PNG ou JPEG de moins de 1 Mo.");
      const response = await fetch("/api/invoice-customization/logo", {
        method: file ? "PUT" : "DELETE",
        body: file,
        credentials: "same-origin",
        headers: file ? { "Content-Type": file.type } : {},
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Modification du logo impossible.");
      setLoaded((current) => current && { ...current, hasLogo: !!file });
      setLogoVersion((current) => current + 1);
      setMessage(
        file ? "Logo enregistré. Il sera utilisé pour les prochaines factures." : "Logo retiré.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed)
    return (
      <ErrorMessage message="La personnalisation est réservée aux personnes autorisées à modifier les paramètres." />
    );
  if (!loaded) return error ? <ErrorMessage message={error} /> : <Loading />;
  const enabled = loaded.canCustomize;

  function field(
    key: TextKey,
    label: string,
    max: number,
    multiline = false,
    placeholder?: string,
  ) {
    return (
      <label className={`field ${multiline ? "full-width" : ""}`} key={key}>
        <span>{label}</span>
        {multiline ? (
          <textarea
            value={settings[key]}
            rows={3}
            maxLength={max}
            onChange={(e) => change(key, e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <input
            value={settings[key]}
            type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
            maxLength={max}
            onChange={(e) =>
              change(key, key === "prefix" ? e.target.value.toUpperCase() : e.target.value)
            }
            placeholder={placeholder}
            required={key === "prefix"}
          />
        )}
      </label>
    );
  }

  return (
    <div className="invoice-settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PARAMÈTRES · FACTURES</div>
          <h1>Des factures à votre image</h1>
          <p>Personnalisez vos prochaines factures et consultez leur aperçu avant d’enregistrer.</p>
        </div>
        <Link href="/parametres" className="button secondary">
          Paramètres
        </Link>
      </div>
      {!enabled && (
        <section className="card invoice-upgrade">
          <FileText size={26} />
          <div>
            <h2>Votre facture, votre identité</h2>
            <p>
              Cette fonctionnalité est disponible avec PRO. Ajoutez votre logo, vos couleurs et vos
              textes, puis retirez la mention « Créé avec {APP_BRAND_NAME} ».
            </p>
            <Link href="/pricing" className="button primary">
              Découvrir PRO — 4 €/mois
            </Link>
            <p className="muted">
              Vos factures FREE restent disponibles au téléchargement et à l’impression.
            </p>
          </div>
        </section>
      )}
      {error && <ErrorMessage message={error} />}
      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}
      <div className="invoice-mobile-tabs">
        <button
          className={`button ${!mobilePreview ? "primary" : "secondary"}`}
          aria-pressed={!mobilePreview}
          onClick={() => setMobilePreview(false)}
        >
          Réglages
        </button>
        <button
          className={`button ${mobilePreview ? "primary" : "secondary"}`}
          aria-pressed={mobilePreview}
          onClick={() => setMobilePreview(true)}
        >
          <Eye size={18} /> Aperçu
        </button>
      </div>
      <div
        className={`invoice-customization-grid ${mobilePreview ? "show-preview" : "show-settings"}`}
      >
        <form className="invoice-settings-form" onSubmit={save}>
          <fieldset disabled={!enabled || busy}>
            <section className="card settings-card">
              <h2>Identité de l’entreprise</h2>
              <p className="muted">Un champ vide reprend les coordonnées de votre entreprise.</p>
              <div className="form-grid">
                {field("displayName", "Nom affiché", 200, false, loaded.company.name)}
                {field("taxNumber", "Numéro fiscal", 150, false, loaded.company.taxNumber ?? "")}
                {field("phone", "Téléphone", 100, false, loaded.company.phone ?? "")}
                {field("email", "Email", 254, false, loaded.company.email ?? "")}
                {field("address", "Adresse", 2000, true, loaded.company.address ?? "")}
                {field("legalInformation", "Informations légales", 3000, true)}
                {field("bankDetails", "Coordonnées bancaires", 1000, true)}
              </div>
            </section>
            <section className="card settings-card">
              <h2>Logo et apparence</h2>
              {loaded.hasLogo && (
                <div className="invoice-logo-preview">
                  <Image
                    src={`/api/invoice-customization/logo?v=${logoVersion}`}
                    alt="Logo actuel de l’entreprise"
                    width={120}
                    height={72}
                    unoptimized
                  />
                  <button className="button secondary" type="button" onClick={() => logo(null)}>
                    <Trash2 size={16} /> Retirer
                  </button>
                </div>
              )}
              <label className="field">
                <span>Logo PNG ou JPEG · 1 Mo maximum · 2 400 pixels de côté</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void logo(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Modèle</span>
                  <select
                    value={settings.template}
                    onChange={(e) =>
                      change("template", e.target.value as InvoiceCustomizationSettings["template"])
                    }
                  >
                    <option value="CLASSIC">Classique</option>
                    <option value="MODERN">Moderne</option>
                    <option value="MINIMAL">Minimal</option>
                  </select>
                </label>
                <label className="field">
                  <span>Couleur principale</span>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => change("primaryColor", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Couleur d’accent</span>
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => change("accentColor", e.target.value)}
                  />
                </label>
              </div>
              {(
                [
                  ["showLogo", "Afficher le logo"],
                  ["showContact", "Afficher les coordonnées de contact"],
                  ["removeBranding", `Retirer la mention « Créé avec ${APP_BRAND_NAME} »`],
                ] as const
              ).map(([key, label]) => (
                <label className="invoice-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(e) => change(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </section>
            <section className="card settings-card">
              <h2>Textes et conditions</h2>
              <div className="form-grid">
                {field("headerText", "Texte en haut de facture", 1000, true)}
                {field("terms", "Conditions de paiement par défaut", 5000, true)}
                {field("defaultNotes", "Notes par défaut", 5000, true)}
                {field("thankYou", "Message de remerciement", 500, true)}
                {field("footerText", "Texte en bas de facture", 2000, true)}
              </div>
            </section>
            <section className="card settings-card">
              <h2>Numérotation et échéance</h2>
              <div className="form-grid">
                {field("prefix", "Préfixe", 16)}
                <label className="field">
                  <span>Format du numéro</span>
                  <select
                    value={settings.numberFormat}
                    onChange={(e) =>
                      change(
                        "numberFormat",
                        e.target.value as InvoiceCustomizationSettings["numberFormat"],
                      )
                    }
                  >
                    <option value="DASH">PRÉFIXE-ANNÉE-000001</option>
                    <option value="SLASH">PRÉFIXE/ANNÉE/000001</option>
                  </select>
                </label>
                <label className="field">
                  <span>Délai de paiement (jours)</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={settings.defaultDueDays}
                    onChange={(e) => change("defaultDueDays", Number(e.target.value))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Format de date</span>
                  <select
                    value={settings.dateFormat}
                    onChange={(e) =>
                      change(
                        "dateFormat",
                        e.target.value as InvoiceCustomizationSettings["dateFormat"],
                      )
                    }
                  >
                    <option value="FR">27/09/2026</option>
                    <option value="ISO">2026-09-27</option>
                    <option value="LONG">27 septembre 2026</option>
                  </select>
                </label>
                <label className="field">
                  <span>Devise de l’entreprise</span>
                  <input
                    value={settings.currency}
                    readOnly
                    aria-describedby="invoice-currency-note"
                  />
                </label>
              </div>
              <p className="muted" id="invoice-currency-note">
                La devise reste celle de votre caisse. Les factures existantes et leur numérotation
                sont conservées. Changer de préfixe ne remet pas la séquence annuelle à zéro.
              </p>
              <p className="form-note">
                Exemple : {formatInvoiceNumber(1, new Date().getFullYear(), settings)}
              </p>
            </section>
            <section className="card settings-card">
              <h2>Colonnes et champs personnalisés</h2>
              {(
                [
                  ["quantity", "Quantité"],
                  ["unitPrice", "Prix unitaire"],
                  ["tax", "Taxe par ligne"],
                  ["discount", "Remise par ligne"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="invoice-toggle">
                  <input
                    type="checkbox"
                    checked={settings.columns[key]}
                    onChange={(e) =>
                      change("columns", { ...settings.columns, [key]: e.target.checked })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <p className="muted">
                Les désignations, les totaux et les montants à payer restent toujours visibles.
              </p>
              {settings.customFields.map((item, index) => (
                <div className="invoice-custom-field" key={index}>
                  <label className="field">
                    <span>Libellé {index + 1}</span>
                    <input
                      maxLength={80}
                      required
                      value={item.label}
                      onChange={(e) =>
                        change(
                          "customFields",
                          settings.customFields.map((f, i) =>
                            i === index ? { ...f, label: e.target.value } : f,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Valeur</span>
                    <input
                      maxLength={500}
                      value={item.value}
                      onChange={(e) =>
                        change(
                          "customFields",
                          settings.customFields.map((f, i) =>
                            i === index ? { ...f, value: e.target.value } : f,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Retirer le champ ${index + 1}`}
                    onClick={() =>
                      change(
                        "customFields",
                        settings.customFields.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={settings.customFields.length >= 8}
                onClick={() =>
                  change("customFields", [
                    ...settings.customFields,
                    { label: "Référence", value: "" },
                  ])
                }
              >
                <Plus size={17} /> Ajouter un champ
              </button>
            </section>
            <button className="button primary invoice-save" disabled={busy}>
              <Save size={18} />
              {busy ? "Enregistrement…" : "Enregistrer la personnalisation"}
            </button>
          </fieldset>
          <p className="muted">
            Le logo est enregistré dès son ajout. Les autres réglages s’appliquent après
            enregistrement, uniquement aux prochaines factures émises.
          </p>
        </form>
        <aside className="card invoice-live-preview">
          <div className="invoice-preview-heading">
            <div>
              <h2>Aperçu en direct</h2>
              <p className="muted">Le même document pour l’aperçu, le PDF et l’impression.</p>
            </div>
            {previewUrl && (
              <a className="button secondary" href={previewUrl} target="_blank" rel="noreferrer">
                <Eye size={17} /> Ouvrir
              </a>
            )}
          </div>
          {previewError && <ErrorMessage message={previewError} />}
          {previewUrl ? (
            <iframe title="Aperçu de votre facture PDF" src={`${previewUrl}#toolbar=0&view=FitH`} />
          ) : (
            <p className="muted" role="status">
              Préparation de l’aperçu…
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
