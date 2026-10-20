import { DEFAULT_BANK_CODE, ACCOUNT_TYPE_RUT, bankName, accountTypeLabel } from "./banks";
import { formatRutForDisplay } from "./rutUtils";

export const TYPE_META = {
  persona: { icon: "👤", label: "Persona", nameLabel: "Nombre" },
  empresa: { icon: "🏢", label: "Empresa", nameLabel: "Razón social" },
};

export const newAccountId = () =>
  `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export const emptyAccount = () => ({
  id: newAccountId(),
  label: "",
  titular: "",
  rutTitular: "",
  bankCode: DEFAULT_BANK_CODE,
  accountType: ACCOUNT_TYPE_RUT,
  accountNumber: "",
  email: "",
});

// Empresa siempre muestra el RUT. Persona, según `includeRut`; si la ficha no
// tiene ese campo, se muestra cuando hay RUT cargado.
export const rutIncluded = (card) => card.type !== "persona" || (card.includeRut ?? !!card.rut);

export const emptyCard = (type = "persona") => ({
  type,
  name: "",
  rut: "",
  // Persona arranca con el RUT oculto; apagar el toggle solo lo oculta, el
  // dato se conserva. Empresa lo muestra siempre.
  includeRut: type !== "persona",
  phone: "",
  email: "",
  address: "",
  giro: "",
  note: "",
  accounts: [],
  favorite: false,
});

// Texto plano de una cuenta bancaria — formato "bloque de transferencia".
export function accountToText(acc) {
  const lines = [];
  if (acc.titular) lines.push(`Titular: ${acc.titular}`);
  if (acc.rutTitular) lines.push(`RUT: ${formatRutForDisplay(acc.rutTitular)}`);
  lines.push(`Banco: ${bankName(acc.bankCode)}`);
  lines.push(`Tipo: ${accountTypeLabel(acc.accountType)}`);
  if (acc.accountNumber) lines.push(`N° Cuenta: ${acc.accountNumber}`);
  if (acc.email) lines.push(`Email: ${acc.email}`);
  return lines.join("\n");
}

// Texto plano de toda la ficha — datos + todas las cuentas.
export function cardToText(card) {
  const meta = TYPE_META[card.type] || TYPE_META.persona;
  const lines = [];
  if (card.name) lines.push(`${meta.nameLabel}: ${card.name}`);
  if (card.rut && rutIncluded(card)) lines.push(`RUT: ${formatRutForDisplay(card.rut)}`);
  if (card.giro) lines.push(`Giro: ${card.giro}`);
  if (card.address) lines.push(`Dirección: ${card.address}`);
  if (card.phone) lines.push(`Teléfono: ${card.phone}`);
  if (card.email) lines.push(`Email: ${card.email}`);
  if (card.note) lines.push(`Nota: ${card.note}`);
  const accounts = Array.isArray(card.accounts) ? card.accounts : [];
  accounts.forEach((acc, i) => {
    const tag = acc.label ? ` (${acc.label})` : "";
    lines.push("", `— Cuenta ${i + 1}${tag} —`, accountToText(acc));
  });
  return lines.join("\n");
}

// Si la ficha calza con lo buscado: el texto, sin distinguir mayúsculas, dentro
// del nombre, el RUT, el giro, el correo, el teléfono o la dirección.
export function cardMatchesSearch(card, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [card.name, card.rut, card.giro, card.email, card.phone, card.address]
    .some((v) => String(v || "").toLowerCase().includes(q));
}
