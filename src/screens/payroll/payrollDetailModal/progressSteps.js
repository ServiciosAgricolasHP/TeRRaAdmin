// El progreso de una acción del detalle de la nómina para `ProgressOverlay`.
// `steps` nombra cada paso que avisa el servicio con su texto y su tramo de la
// barra (`from`–`to`); el que cuenta algo (`unit`: ciclos, jornadas) avanza
// dentro de su tramo. Un paso que no está en `steps` devuelve null.
export function progressOf(steps, key, done, total) {
  const s = steps[key];
  if (!s) return null;
  const share = total ? done / total : 0;
  return {
    step: s.step,
    detail: s.unit && total ? `${s.unit} ${done}/${total}` : "",
    percent: s.from + (s.to - s.from) * share,
  };
}
