import { useState } from "react";
import PhoneBookTab from "./infoAccounts/PhoneBookTab";
import ContactCardsTab from "./infoAccounts/ContactCardsTab";

const TABS = [
  { value: "cards", label: "🏦 Información y cuentas" },
  { value: "phoneBook", label: "📞 Agenda telefónica" },
];

// Agenda y Cuentas: las fichas con datos bancarios y la agenda telefónica,
// en dos pestañas. Abre siempre en las fichas: la agenda se lee solo al
// elegir su pestaña.
export default function InfoAccounts() {
  const [tab, setTab] = useState("cards");

  return (
    <div>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">Agenda y Cuentas</h1>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border)]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`relative px-4 py-2 text-sm transition-colors ${
              tab === t.value ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            {tab === t.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>
      {tab === "cards" ? <ContactCardsTab /> : <PhoneBookTab />}
    </div>
  );
}
