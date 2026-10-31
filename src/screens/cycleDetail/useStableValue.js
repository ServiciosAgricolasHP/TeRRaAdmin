import { useState } from "react";

// El mismo valor mientras `key` no cambie. `key` resume el contenido (su JSON,
// por ejemplo): lo que depende del valor no se rehace por recibir un objeto
// nuevo con lo mismo adentro.
export function useStableValue(value, key) {
  const [held, setHeld] = useState({ key, value });
  if (held.key !== key) {
    setHeld({ key, value });
    return value;
  }
  return held.value;
}
