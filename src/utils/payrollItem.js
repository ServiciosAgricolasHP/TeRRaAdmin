// Reparto de anticipos y bonos sobre el bruto de un trabajador.
//
// Esta cuenta estaba escrita cuatro veces adentro de `Payroll.jsx` —al armar
// la nómina, al agregar ciclos, al recalcular, y al aplicar anticipos nuevos
// sobre alguien que ya estaba— y AGENTS.md avisaba que tocar el orden o el
// tope obligaba a tocar las cuatro. Los cuatro sitios son el mismo algoritmo:
// el último arranca de una base que ya trae descuentos aplicados, y eso es
// justo lo que expresan `alreadyAdvanced` / `alreadyBonused`.
//
// La regla, y por qué importa el orden:
//
//   1. Los BONOS van primero y se aplican completos. Engrosan la base contra
//      la que después se descuenta el anticipo.
//   2. Los ANTICIPOS van después, del más viejo al más nuevo, topeados por
//      esa base. De cada uno se toma `advanceDueNow`: la cuota si tiene plan,
//      el saldo entero si no.
//
// Invertir el orden deja el anticipo sin liquidar por exactamente el monto del
// bono: al trabajador se le entrega el bono en la mano y la deuda arrastra a
// la nómina siguiente en vez de cerrarse. La plata que desembolsa la empresa
// es la misma en los dos órdenes; lo que cambia es si la deuda queda cerrada.
import { advanceRemaining, advanceDueNow } from "../services/advancesService";

const porFechaAsc = (a, b) => {
  const da = a?.date || "";
  const db = b?.date || "";
  return da < db ? -1 : da > db ? 1 : 0;
};

export function allocateAdvances({
  gross,
  anticipos = [],
  bonos = [],
  alreadyAdvanced = 0,
  alreadyBonused = 0,
}) {
  const brutoInt = Math.round(Number(gross) || 0);
  const yaDescontado = Number(alreadyAdvanced) || 0;
  const yaAcreditado = Number(alreadyBonused) || 0;

  // Bonos: completos, nunca tienen plan de cuotas.
  const bonoApplications = [];
  for (const bono of [...bonos].sort(porFechaAsc)) {
    const saldo = Math.round(advanceRemaining(bono));
    if (saldo <= 0) continue;
    bonoApplications.push({ advanceId: bono.id, amount: saldo });
  }
  const bonosTotal = bonoApplications.reduce((s, x) => s + x.amount, 0);

  // Anticipos: oldest-first, topeados por lo que queda de base.
  let base = Math.max(0, brutoInt + yaAcreditado + bonosTotal - yaDescontado);
  const anticipoApplications = [];
  for (const anticipo of [...anticipos].sort(porFechaAsc)) {
    if (base <= 0) break;
    const cuota = Math.round(advanceDueNow(anticipo));
    if (cuota <= 0) continue;
    const aplicar = Math.min(base, cuota);
    if (aplicar <= 0) continue;
    // `maxAmount` es el saldo REAL, sin el tope de la cuota. Es lo que deja
    // que el override manual del preview suba por encima de la cuota sugerida
    // sin descuadrar lo descontado contra lo acreditado.
    anticipoApplications.push({
      advanceId: anticipo.id,
      amount: aplicar,
      maxAmount: Math.round(advanceRemaining(anticipo)),
    });
    base -= aplicar;
  }
  const anticiposTotal = anticipoApplications.reduce((s, x) => s + x.amount, 0);

  const advanceTotal = yaDescontado + anticiposTotal;
  const bonusTotal = yaAcreditado + bonosTotal;

  return {
    anticipoApplications,
    bonoApplications,
    // Lo aplicado EN ESTA PASADA.
    anticiposTotal,
    bonosTotal,
    // Acumulado, contando lo que ya venía aplicado.
    advanceTotal,
    bonusTotal,
    // Neto. Nunca negativo: un anticipo no puede dejar debiendo al trabajador.
    amount: Math.max(0, brutoInt - advanceTotal + bonusTotal),
  };
}

// Etiqueta corta para la columna "Anticipo" del preview ("Anticipos 2 · Bonos 1").
export function advanceNote({ anticipoApplications = [], bonoApplications = [] }) {
  const partes = [];
  if (anticipoApplications.length) partes.push(`Anticipos ${anticipoApplications.length}`);
  if (bonoApplications.length) partes.push(`Bonos ${bonoApplications.length}`);
  return partes.join(" · ");
}
