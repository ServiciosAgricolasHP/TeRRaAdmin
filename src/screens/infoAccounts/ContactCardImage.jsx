import { forwardRef } from "react";
import { TYPE_META, rutIncluded } from "../../utils/contactCards";
import { bankName, accountTypeLabel } from "../../utils/banks";
import { formatRutForDisplay } from "../../utils/rutUtils";

// ============================================================
// Tarjeta estilizada para exportar como imagen
// ============================================================
// Render off-screen con estilos inline (html-to-image no siempre resuelve las
// clases Tailwind con variables CSS, así que fijamos colores literales). Ancho
// fijo para que la imagen tenga proporción de "tarjeta".
const IMG_ACCENT = {
  persona: { from: "#2563eb", to: "#1e40af", soft: "#eff6ff", ink: "#1e3a8a" },
  empresa: { from: "#15803d", to: "#166534", soft: "#f0fdf4", ink: "#14532d" },
};

const ContactCardImage = forwardRef(function ContactCardImage({ card }, ref) {
  const meta = TYPE_META[card.type] || TYPE_META.persona;
  const c = IMG_ACCENT[card.type] || IMG_ACCENT.persona;
  const accounts = Array.isArray(card.accounts) ? card.accounts : [];

  const dataRows = [
    card.type === "empresa" && card.giro ? ["Giro", card.giro] : null,
    card.address ? ["Dirección", card.address] : null,
    card.phone ? ["Teléfono", card.phone] : null,
    card.email ? ["Email", card.email] : null,
    card.note ? ["Nota", card.note] : null,
  ].filter(Boolean);

  const rowStyle = { display: "flex", gap: 10, fontSize: 13, lineHeight: 1.4, marginBottom: 4 };
  const labelStyle = { width: 78, flexShrink: 0, color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, paddingTop: 2 };
  const valueStyle = { flex: 1, color: "#111827", wordBreak: "break-word" };

  return (
    <div
      ref={ref}
      style={{
        width: 380,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#ffffff",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid #e5e7eb",
        color: "#111827",
      }}
    >
      {/* Header con gradiente */}
      <div style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})`, color: "#ffffff", padding: "20px 22px" }}>
        <div style={{ fontSize: 32, lineHeight: 1 }}>{meta.icon}</div>
        <div style={{ fontSize: 21, fontWeight: 700, marginTop: 8, lineHeight: 1.2 }}>{card.name || "(sin nombre)"}</div>
        <div style={{ fontSize: 11, opacity: 0.9, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {meta.label}
          {card.rut && rutIncluded(card) ? ` · ${formatRutForDisplay(card.rut)}` : ""}
        </div>
      </div>

      {/* Datos */}
      {dataRows.length > 0 && (
        <div style={{ padding: "16px 22px 8px" }}>
          {dataRows.map(([label, value]) => (
            <div key={label} style={rowStyle}>
              <span style={labelStyle}>{label}</span>
              <span style={valueStyle}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cuentas */}
      {accounts.length > 0 && (
        <div style={{ padding: "4px 22px 16px" }}>
          {accounts.map((acc, i) => (
            <div
              key={acc.id || i}
              style={{ background: c.soft, borderRadius: 10, padding: "10px 12px", marginTop: 10 }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: c.ink, marginBottom: 6 }}>
                🏦 {acc.label || (accounts.length > 1 ? `Cuenta ${i + 1}` : "Cuenta")}
              </div>
              {acc.titular && <ImgAccRow label="Titular" value={acc.titular} />}
              {acc.rutTitular && <ImgAccRow label="RUT" value={formatRutForDisplay(acc.rutTitular)} />}
              <ImgAccRow label="Banco" value={bankName(acc.bankCode)} />
              <ImgAccRow label="Tipo" value={accountTypeLabel(acc.accountType)} />
              {acc.accountNumber && <ImgAccRow label="N° Cuenta" value={acc.accountNumber} strong />}
              {acc.email && <ImgAccRow label="Email" value={acc.email} />}
            </div>
          ))}
        </div>
      )}

      {/* Footer marca */}
      <div style={{ borderTop: "1px solid #f3f4f6", padding: "8px 22px", fontSize: 10, color: "#9ca3af", textAlign: "right" }}>
        🌾 TeRRA
      </div>
    </div>
  );
});

function ImgAccRow({ label, value, strong = false }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.4, marginBottom: 2 }}>
      <span style={{ width: 68, flexShrink: 0, color: "#6b7280", fontSize: 10 }}>{label}</span>
      <span style={{ flex: 1, color: "#111827", fontWeight: strong ? 700 : 400, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

export default ContactCardImage;
