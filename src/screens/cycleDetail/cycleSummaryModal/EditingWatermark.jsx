// Marca de agua de borrador: translúcida, para que se lean los números
// mientras se edita, y que deje marcada una captura manual del resumen.
export function EditingWatermark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        pointerEvents: "none",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-25%",
          left: "-25%",
          width: "150%",
          height: "150%",
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          justifyContent: "center",
          gap: "40px 56px",
          transform: "rotate(-30deg)",
        }}
      >
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            style={{
              color: "rgba(220, 38, 38, 0.13)",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "0.12em",
              whiteSpace: "nowrap",
            }}
          >
            EDITANDO — NO ENVIAR
          </span>
        ))}
      </div>
    </div>
  );
}
