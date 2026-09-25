"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

const options = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
] as const;

export function ThemeOptions({ onSelect }: { onSelect?: () => void }) {
  const { preference, setPreference } = useTheme();
  return (
    <div className="theme-options" role="group" aria-label="Thème de l’interface">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className="theme-option"
          aria-pressed={preference === value}
          onClick={() => {
            setPreference(value);
            onSelect?.();
          }}
        >
          <Icon size={17} aria-hidden="true" />
          <span>{label}</span>
          {preference === value && <Check size={15} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function ThemePicker() {
  const { preference } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = options.find((option) => option.value === preference)!;
  const Icon = selected.icon;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      className="theme-picker"
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="icon-button theme-trigger"
        aria-label={`Choisir le thème, actuel : ${selected.label}`}
        title="Thème clair, sombre ou système"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon size={19} aria-hidden="true" />
        <span className="theme-trigger-label">Thème</span>
      </button>
      {open && (
        <div className="theme-menu" id={id}>
          <span className="dropdown-heading">Apparence</span>
          <ThemeOptions
            onSelect={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
