export function GroupHeaderRowRenderer(props) {
  const data = props.data || {};
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        height: "100%",
        background: "var(--color-accent-soft)",
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--color-accent)",
      }}
    >
      <span>👥 {data._leader}</span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>· {data._count} trab.</span>
    </div>
  );
}
