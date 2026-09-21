import { describe, it, expect, vi } from "vitest";

// `advancesService.js` importa `../firebase`, que hace `initializeApp()` en el
// top level. Los helpers que probamos acá son puros — están en ese archivo solo
// porque quedaron al lado de las escrituras. El mock evita construir una app de
// Firebase para calcular una división.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  normalizeAdvanceType,
  advanceSign,
  isBono,
  advanceTypeMeta,
  advanceWorkerKey,
  advanceMatchesWorker,
  advanceRemaining,
  cadenceMeta,
  computeCuotaAmount,
  hasInstallmentPlan,
  lastCuotaDate,
  daysSinceLastCuota,
  installmentProgress,
  advanceDueNow,
} = await import("./advancesService");

const anticipo = (over = {}) => ({ type: "anticipo", amount: 100000, amountPaid: 0, ...over });
const bono = (over = {}) => ({ type: "bono", amount: 20000, amountPaid: 0, ...over });

describe("tipo y signo", () => {
  it("el legacy adelanto es un anticipo", () => {
    expect(normalizeAdvanceType("adelanto")).toBe("anticipo");
    expect(advanceSign("adelanto")).toBe(-1);
  });

  it("el default cuando no hay tipo es anticipo", () => {
    expect(normalizeAdvanceType(undefined)).toBe("anticipo");
    expect(normalizeAdvanceType("")).toBe("anticipo");
    expect(advanceSign({})).toBe(-1);
  });

  it("el bono suma y el anticipo resta", () => {
    // Un error de signo acá invierte la plata de alguien.
    expect(advanceSign("bono")).toBe(+1);
    expect(advanceSign(bono())).toBe(+1);
    expect(advanceSign(anticipo())).toBe(-1);
    expect(isBono(bono())).toBe(true);
    expect(isBono(anticipo())).toBe(false);
  });

  it("acepta tanto el documento como el string", () => {
    expect(advanceSign("bono")).toBe(advanceSign({ type: "bono" }));
  });

  it("un tipo desconocido cae a anticipo", () => {
    expect(advanceSign("cualquiera")).toBe(-1);
    expect(advanceTypeMeta("cualquiera").value).toBe("anticipo");
  });
});

describe("advanceRemaining", () => {
  it("es lo que falta pagar", () => {
    expect(advanceRemaining(anticipo({ amount: 100000, amountPaid: 30000 }))).toBe(70000);
  });

  it("nunca es negativo aunque se haya pagado de más", () => {
    expect(advanceRemaining(anticipo({ amount: 100000, amountPaid: 150000 }))).toBe(0);
  });

  it("no propaga NaN", () => {
    expect(advanceRemaining(null)).toBe(0);
    expect(advanceRemaining({})).toBe(0);
    expect(advanceRemaining({ amount: "x", amountPaid: undefined })).toBe(0);
  });
});

describe("computeCuotaAmount", () => {
  it("redondea para arriba a propósito, así las cuotas siempre cubren el total", () => {
    // Con ceil, 3 cuotas de 33.334 cubren 100.000 y la última queda más chica
    // sola (la clippea advanceRemaining). Con round quedaría 1 peso sin pagar.
    expect(computeCuotaAmount(100000, 3)).toBe(33334);
    expect(computeCuotaAmount(100000, 3) * 3).toBeGreaterThanOrEqual(100000);
  });

  it("divide exacto cuando da", () => {
    expect(computeCuotaAmount(300000, 3)).toBe(100000);
  });

  it("un count inválido se trata como una sola cuota", () => {
    expect(computeCuotaAmount(100000, 0)).toBe(100000);
    expect(computeCuotaAmount(100000, -5)).toBe(100000);
    expect(computeCuotaAmount(100000, undefined)).toBe(100000);
    expect(computeCuotaAmount(100000, 2.9)).toBe(50000); // floor(2.9) = 2
  });

  it("monto cero da cuota cero", () => {
    expect(computeCuotaAmount(0, 3)).toBe(0);
  });
});

describe("hasInstallmentPlan", () => {
  it("hace falta más de una cuota", () => {
    expect(hasInstallmentPlan(anticipo({ installments: { count: 3 } }))).toBe(true);
    expect(hasInstallmentPlan(anticipo({ installments: { count: 1 } }))).toBe(false);
    expect(hasInstallmentPlan(anticipo())).toBe(false);
  });

  it("un bono nunca tiene plan, aunque traiga el campo", () => {
    expect(hasInstallmentPlan(bono({ installments: { count: 3 } }))).toBe(false);
  });
});

describe("advanceDueNow", () => {
  // Esto es lo que se le resta del sueldo a alguien en la nómina de hoy.
  it("sin plan, el saldo completo", () => {
    expect(advanceDueNow(anticipo({ amount: 100000, amountPaid: 40000 }))).toBe(60000);
  });

  it("con plan, la cuota", () => {
    const a = anticipo({ amount: 300000, installments: { count: 3, amount: 100000 } });
    expect(advanceDueNow(a)).toBe(100000);
  });

  it("la última cuota se clippea al saldo, no cobra de más", () => {
    const a = anticipo({
      amount: 100000,
      amountPaid: 66668,
      installments: { count: 3, amount: 33334 },
    });
    expect(advanceDueNow(a)).toBe(33332);
  });

  it("saldo agotado da 0", () => {
    expect(advanceDueNow(anticipo({ amount: 100000, amountPaid: 100000 }))).toBe(0);
  });

  it("calcula la cuota si el plan no trae el monto", () => {
    const a = anticipo({ amount: 90000, installments: { count: 3 } });
    expect(advanceDueNow(a)).toBe(30000);
  });

  it("nunca devuelve 0 por fecha o cadencia, solo por saldo", () => {
    // La cadencia es una etiqueta para el admin, no un gate automático.
    const a = anticipo({
      amount: 300000,
      installments: { count: 3, amount: 100000, cadence: "mensual" },
      payments: [{ amount: 100000, paidAt: "2026-09-19" }],
      amountPaid: 100000,
    });
    expect(advanceDueNow(a)).toBe(100000);
  });
});

describe("lastCuotaDate", () => {
  it("toma el MÁXIMO, no el último del array", () => {
    // Revertir una nómina filtra entradas del medio, así que el array puede
    // quedar desordenado por fecha.
    const a = anticipo({
      payments: [
        { amount: 1, paidAt: "2026-05-01" },
        { amount: 1, paidAt: "2026-03-01" },
      ],
    });
    expect(lastCuotaDate(a)).toBe("2026-05-01");
  });

  it("ignora pagos en cero", () => {
    const a = anticipo({
      date: "2026-01-01",
      payments: [{ amount: 0, paidAt: "2026-09-01" }],
    });
    expect(lastCuotaDate(a)).toBe("2026-01-01");
  });

  it("cae a la fecha del anticipo si no hay pagos", () => {
    expect(lastCuotaDate(anticipo({ date: "2026-02-03" }))).toBe("2026-02-03");
    expect(lastCuotaDate(anticipo({}))).toBe(null);
  });

  it("recorta timestamps largos a la fecha", () => {
    const a = anticipo({ payments: [{ amount: 1, paidAt: "2026-05-01T18:22:00.000Z" }] });
    expect(lastCuotaDate(a)).toBe("2026-05-01");
  });
});

describe("daysSinceLastCuota", () => {
  it("cuenta días en UTC contra una fecha fija", () => {
    const a = anticipo({ payments: [{ amount: 1, paidAt: "2026-09-01" }] });
    expect(daysSinceLastCuota(a, new Date("2026-09-20T12:00:00Z"))).toBe(19);
  });

  it("no da negativo si la fecha del pago es futura", () => {
    const a = anticipo({ payments: [{ amount: 1, paidAt: "2026-12-01" }] });
    expect(daysSinceLastCuota(a, new Date("2026-09-20T12:00:00Z"))).toBe(0);
  });

  it("null cuando no hay ninguna fecha", () => {
    expect(daysSinceLastCuota(anticipo({}), new Date("2026-09-20T12:00:00Z"))).toBe(null);
  });
});

describe("installmentProgress", () => {
  it("es null sin plan", () => {
    expect(installmentProgress(anticipo())).toBe(null);
    expect(installmentProgress(bono({ installments: { count: 3 } }))).toBe(null);
  });

  it("cuenta cuántas cuotas se pagaron", () => {
    const a = anticipo({
      amount: 300000,
      amountPaid: 200000,
      installments: { count: 3, amount: 100000, cadence: "quincenal" },
      date: "2026-01-01",
    });
    const p = installmentProgress(a);
    expect(p).toMatchObject({ count: 3, paidCount: 2, cuotaAmount: 100000, remaining: 100000 });
  });

  it("no pasa de la cantidad de cuotas del plan", () => {
    const a = anticipo({
      amount: 300000,
      amountPaid: 999999,
      installments: { count: 3, amount: 100000 },
    });
    expect(installmentProgress(a).paidCount).toBe(3);
  });

  it("no divide por cero si la cuota quedó en cero", () => {
    const a = anticipo({ amount: 0, amountPaid: 0, installments: { count: 3, amount: 0 } });
    expect(installmentProgress(a).paidCount).toBe(0);
  });
});

describe("advanceWorkerKey / advanceMatchesWorker", () => {
  it("la clave prefiere workerId y cae a workerRut", () => {
    expect(advanceWorkerKey({ workerId: "1-9", workerRut: "2-7" })).toBe("1-9");
    expect(advanceWorkerKey({ workerRut: "2-7" })).toBe("2-7");
    expect(advanceWorkerKey({})).toBe("");
  });

  it("matchea contra CUALQUIERA de los dos identificadores", () => {
    // Quedarse con el derivado pierde el match cuando lo que se conoce es el
    // otro: alguien nunca vería su deuda cobrada.
    const a = { workerId: "1-9", workerRut: "2-7" };
    expect(advanceMatchesWorker(a, new Set(["1-9"]))).toBe(true);
    expect(advanceMatchesWorker(a, new Set(["2-7"]))).toBe(true);
    expect(advanceMatchesWorker(a, new Set(["3-5"]))).toBe(false);
  });

  it("no matchea con campos vacíos", () => {
    expect(advanceMatchesWorker({ workerId: "", workerRut: "" }, new Set([""]))).toBe(false);
  });
});

describe("cadenceMeta", () => {
  it("resuelve las cadencias conocidas y cae a porPago", () => {
    expect(cadenceMeta("quincenal")).toMatchObject({ value: "quincenal", minDays: 15 });
    expect(cadenceMeta("mensual")).toMatchObject({ value: "mensual", minDays: 30 });
    expect(cadenceMeta("inventada")).toMatchObject({ value: "porPago" });
    expect(cadenceMeta(undefined)).toMatchObject({ value: "porPago" });
  });
});
