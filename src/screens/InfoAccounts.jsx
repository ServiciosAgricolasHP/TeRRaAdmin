import { useState } from "react";
import PhoneBookTab from "./infoAccounts/PhoneBookTab";
import ContactCardsTab from "./infoAccounts/ContactCardsTab";
import { readStored, writeStored } from "../utils/browserStorage";

const TABS = [
  { value: "phoneBook", label: "📞 Agenda telefónica" },
  { value: "cards", label: "🏦 Información y cuentas" },
];
const TAB_KEY = "infoAccounts.tab";

// Agenda y Cuentas: la agenda telefónica y las fichas con datos
// bancarios, en dos pestañas. Abre en la última elegida (la agenda, la
// primera vez).
export default function InfoAccounts() {
  const [tab, setTab] = useState(() => (readStored(TAB_KEY) === "cards" ? "cards" : "phoneBook"));
  const choose = (value) => {
    setTab(value);
    writeStored(TAB_KEY, value);
  };

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
            onClick={() => choose(t.value)}
            className={`relative px-4 py-2 text-sm transition-colors ${
              tab === t.value ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            {tab === t.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>
      {tab === "phoneBook" ? <PhoneBookTab /> : <ContactCardsTab />}
    </div>
  );
}
