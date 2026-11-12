import { useState, useRef, useEffect, useEffectEvent } from "react";
import { readAmount } from "../../utils/formula";

// Editor de las celdas numéricas de la grilla. Si la celda ya tiene un valor,
// arranca con `=<valor>` para que baste agregar `+50` (o `-10`, `*2`, `/3`)
// y lo evalúe readAmount(). Si la edición se abrió tipeando un carácter
// (dígito u operador), arranca con ese carácter, como hace AG-Grid.
//
// En AG-Grid v33+ el valor editado se informa con `onValueChange`: el
// `getValue()` del proxy devuelve lo último reportado por ahí, no lo que se
// exponga con useImperativeHandle o useGridCellEditor.
export function FormulaCellEditor({ initialValue, onValueChange, eventKey }) {
  const startFromKey = eventKey && /^[\d+\-*/(.]$/.test(eventKey);
  const initial = startFromKey
    ? String(eventKey)
    : (initialValue != null && initialValue !== "" && Number(initialValue) !== 0)
      ? `=${initialValue}`
      : String(initialValue == null ? "" : initialValue);
  const [text, setText] = useState(initial);
  const inputRef = useRef(null);
  // Lo que se escribe y no se puede interpretar ("25 mil", "=100+") deja el
  // valor que tenía la celda, en vez de un 0 que borra la jornada.
  const previous = Number(initialValue) || 0;
  const valueOf = (v) => readAmount(v) ?? previous;

  // Informa al proxy el valor inicial ya evaluado, así Enter sin editar
  // confirma ese mismo número.
  const reportInitial = useEffectEvent(() => onValueChange?.(valueOf(initial)));
  useEffect(() => {
    reportInitial();
  }, []);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    // Cursor al final para que sea instantáneo agregar +/-/*/÷ al valor.
    const len = inputRef.current.value.length;
    inputRef.current.setSelectionRange(len, len);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    // Informa al proxy el número ya evaluado en cada tecla. Una expresión a
    // medio escribir (ej. "=100+") vale lo que tenía la celda hasta
    // completarla; borrar todo deja 0.
    onValueChange?.(valueOf(v));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={handleChange}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "0 4px",
        fontFamily: "inherit",
        fontSize: "inherit",
        textAlign: "right",
        background: "transparent",
        color: "var(--color-text)",
      }}
    />
  );
}
