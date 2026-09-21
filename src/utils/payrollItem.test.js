import { describe, it, expect, vi } from "vitest";

// `payrollItem` importa los helpers de cuotas de `advancesService`, que arrastra
// `../firebase`. Los helpers son puros; el mock evita levantar Firebase.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { allocateAdvances, advanceNote } = await import("./payrollItem");

const anticipo = (id, amount, over = {}) => ({
  id,
  type: "anticipo",
  amount,
  amountPaid: 0,
  date: "2026-01-01",
  ...over,
});
const bono = (id, amount, over = {}) => ({
  id,
  type: "bono",
  amount,
  amountPaid: 0,
  date: "2026-01-01",
  ...over,
});

describe("allocateAdvances — el caso sin nada aplicado (armar la nómina)", () => {
  it("sin anticipos ni bonos, el neto es el bruto", () => {
    const r = allocateAdvances({ gross: 500000, anticipos: [], bonos: [] });
    expect(r).toMatchObject({ amount: 500000, anticiposTotal: 0, bonosTotal: 0 });
  });

  it("un bono suma al neto", () => {
    const r = allocateAdvances({ gross: 100000, bonos: [bono("b1", 20000)] });
    expect(r.amount).toBe(120000);
    expect(r.bonoApplications).toEqual([{ advanceId: "b1", amount: 20000 }]);
  });

  it("un anticipo resta del neto", () => {
    const r = allocateAdvances({ gross: 100000, anticipos: [anticipo("a1", 30000)] });
    expect(r.amount).toBe(70000);
    expect(r.anticipoApplications[0]).toMatchObject({ advanceId: "a1", amount: 30000 });
  });

  // ─────────────────────────────────────────────────────────────────────
  // El caso que documenta AGENTS.md y que justifica el orden bonos→anticipos.
  // ─────────────────────────────────────────────────────────────────────
  it("bonos PRIMERO: el bono engrosa la base y deja el anticipo liquidado", () => {
    const r = allocateAdvances({
      gross: 376000,
      bonos: [bono("b1", 24000)],
      anticipos: [anticipo("a1", 400000)],
    });
    // La base es 376.000 + 24.000 = 400.000, justo lo que se debe.
    expect(r.anticiposTotal).toBe(400000);
    expect(r.bonosTotal).toBe(24000);
    expect(r.amount).toBe(0);
    // La deuda queda CERRADA: se aplicó el anticipo entero.
    expect(r.anticipoApplications[0].amount).toBe(400000);
  });

  it("al revés quedarían 24.000 debiendo — por eso el orden no se toca", () => {
    // Simulamos el orden equivocado: el anticipo se topea contra el bruto pelado.
    const soloBruto = allocateAdvances({ gross: 376000, anticipos: [anticipo("a1", 400000)] });
    expect(soloBruto.anticiposTotal).toBe(376000); // quedan 24.000 sin liquidar
    // Y el trabajador igual recibiría el bono en la mano, arrastrando la deuda.
    expect(400000 - soloBruto.anticiposTotal).toBe(24000);
  });

  it("el anticipo nunca deja el neto negativo", () => {
    const r = allocateAdvances({ gross: 50000, anticipos: [anticipo("a1", 500000)] });
    expect(r.amount).toBe(0);
    expect(r.anticiposTotal).toBe(50000); // capado por el bruto
  });

  it("los anticipos se aplican del más viejo al más nuevo", () => {
    const r = allocateAdvances({
      gross: 100000,
      anticipos: [
        anticipo("nuevo", 80000, { date: "2026-06-01" }),
        anticipo("viejo", 80000, { date: "2026-01-01" }),
      ],
    });
    expect(r.anticipoApplications.map((x) => x.advanceId)).toEqual(["viejo", "nuevo"]);
    expect(r.anticipoApplications[0].amount).toBe(80000);
    expect(r.anticipoApplications[1].amount).toBe(20000); // lo que quedaba
  });

  it("corta de aplicar cuando se agota la base", () => {
    const r = allocateAdvances({
      gross: 10000,
      anticipos: [anticipo("a1", 10000), anticipo("a2", 50000)],
    });
    expect(r.anticipoApplications).toHaveLength(1);
    expect(r.anticiposTotal).toBe(10000);
  });

  it("saltea anticipos ya saldados sin consumir base", () => {
    const r = allocateAdvances({
      gross: 100000,
      anticipos: [
        anticipo("saldado", 50000, { amountPaid: 50000, date: "2026-01-01" }),
        anticipo("vivo", 30000, { date: "2026-02-01" }),
      ],
    });
    expect(r.anticipoApplications.map((x) => x.advanceId)).toEqual(["vivo"]);
    expect(r.amount).toBe(70000);
  });

  it("saltea bonos ya consumidos", () => {
    const r = allocateAdvances({
      gross: 100000,
      bonos: [bono("b1", 20000, { amountPaid: 20000 })],
    });
    expect(r.bonoApplications).toEqual([]);
    expect(r.amount).toBe(100000);
  });

  it("con plan de cuotas descuenta la cuota, no el saldo entero", () => {
    const r = allocateAdvances({
      gross: 500000,
      anticipos: [anticipo("a1", 300000, { installments: { count: 3, amount: 100000 } })],
    });
    expect(r.anticiposTotal).toBe(100000);
    expect(r.amount).toBe(400000);
  });

  it("con cuotas, un bono puede no alcanzar a liquidar el anticipo, y está bien", () => {
    const r = allocateAdvances({
      gross: 100000,
      bonos: [bono("b1", 50000)],
      anticipos: [anticipo("a1", 300000, { installments: { count: 3, amount: 100000 } })],
    });
    expect(r.anticiposTotal).toBe(100000); // la cuota, no los 150.000 de base
    expect(r.amount).toBe(50000);
  });

  it("maxAmount guarda el saldo real, no la cuota", () => {
    // Es lo que deja al preview subir el override por encima de la cuota.
    const r = allocateAdvances({
      gross: 500000,
      anticipos: [anticipo("a1", 300000, { installments: { count: 3, amount: 100000 } })],
    });
    expect(r.anticipoApplications[0]).toEqual({
      advanceId: "a1",
      amount: 100000,
      maxAmount: 300000,
    });
  });

  it("redondea el bruto antes de repartir", () => {
    const r = allocateAdvances({ gross: 100000.6, anticipos: [anticipo("a1", 500)] });
    expect(r.amount).toBe(100001 - 500);
  });

  it("no rompe con bruto 0 ni con listas vacías", () => {
    expect(allocateAdvances({ gross: 0 }).amount).toBe(0);
    expect(allocateAdvances({ gross: 0, anticipos: [anticipo("a1", 5000)] })).toMatchObject({
      amount: 0,
      anticiposTotal: 0,
    });
  });

  it("un bruto negativo no explota ni aplica anticipos", () => {
    const r = allocateAdvances({ gross: -1000, anticipos: [anticipo("a1", 5000)] });
    expect(r.anticiposTotal).toBe(0);
    expect(r.amount).toBe(0);
  });
});

describe("allocateAdvances — el caso incremental (anticipos nuevos sobre alguien que ya está)", () => {
  // Reproduce lo que hacía Payroll.jsx cuando se recalcula una nómina y
  // aparecen anticipos que no estaban: la base ya trae descuentos aplicados.
  it("la base descuenta lo ya aplicado y suma lo ya acreditado", () => {
    const r = allocateAdvances({
      gross: 200000,
      alreadyAdvanced: 50000,
      alreadyBonused: 10000,
      anticipos: [anticipo("nuevo", 500000)],
    });
    // Base = 200.000 + 10.000 − 50.000 = 160.000
    expect(r.anticiposTotal).toBe(160000);
    expect(r.advanceTotal).toBe(210000);
    expect(r.bonusTotal).toBe(10000);
    expect(r.amount).toBe(0); // max(0, 200.000 − 210.000 + 10.000)
  });

  it("los bonos nuevos también engrosan la base incremental", () => {
    const r = allocateAdvances({
      gross: 100000,
      alreadyAdvanced: 100000,
      alreadyBonused: 0,
      bonos: [bono("b1", 40000)],
      anticipos: [anticipo("a1", 999999)],
    });
    // Base = 100.000 + 0 + 40.000 − 100.000 = 40.000
    expect(r.bonosTotal).toBe(40000);
    expect(r.anticiposTotal).toBe(40000);
    expect(r.amount).toBe(0);
  });

  it("si ya se descontó todo, no aplica nada nuevo", () => {
    const r = allocateAdvances({
      gross: 100000,
      alreadyAdvanced: 100000,
      anticipos: [anticipo("a1", 50000)],
    });
    expect(r.anticiposTotal).toBe(0);
    expect(r.anticipoApplications).toEqual([]);
  });

  it("sin nada previo da lo mismo que el caso normal", () => {
    const args = { gross: 300000, anticipos: [anticipo("a1", 50000)], bonos: [bono("b1", 10000)] };
    expect(allocateAdvances(args)).toEqual(
      allocateAdvances({ ...args, alreadyAdvanced: 0, alreadyBonused: 0 }),
    );
  });
});

describe("invariantes", () => {
  it("el neto siempre cuadra con bruto − anticipos + bonos", () => {
    const casos = [
      { gross: 500000, anticipos: [anticipo("a", 100000)], bonos: [bono("b", 20000)] },
      { gross: 50000, anticipos: [anticipo("a", 900000)], bonos: [] },
      { gross: 0, anticipos: [], bonos: [bono("b", 5000)] },
      { gross: 120000, anticipos: [anticipo("a", 30000), anticipo("c", 40000)], bonos: [] },
    ];
    for (const caso of casos) {
      const r = allocateAdvances(caso);
      expect(r.amount).toBe(Math.max(0, Math.round(caso.gross) - r.advanceTotal + r.bonusTotal));
    }
  });

  it("lo aplicado nunca supera el saldo de cada anticipo", () => {
    const a = anticipo("a1", 30000, { amountPaid: 10000 });
    const r = allocateAdvances({ gross: 999999, anticipos: [a] });
    expect(r.anticipoApplications[0].amount).toBeLessThanOrEqual(20000);
  });

  it("los totales son la suma de sus aplicaciones", () => {
    const r = allocateAdvances({
      gross: 300000,
      anticipos: [anticipo("a1", 50000), anticipo("a2", 60000)],
      bonos: [bono("b1", 10000), bono("b2", 5000)],
    });
    expect(r.anticiposTotal).toBe(r.anticipoApplications.reduce((s, x) => s + x.amount, 0));
    expect(r.bonosTotal).toBe(r.bonoApplications.reduce((s, x) => s + x.amount, 0));
  });

  it("no muta los arrays que recibe", () => {
    const anticipos = [anticipo("nuevo", 1, { date: "2026-06-01" }), anticipo("viejo", 1, { date: "2026-01-01" })];
    const copia = [...anticipos];
    allocateAdvances({ gross: 100000, anticipos });
    expect(anticipos).toEqual(copia);
  });
});

describe("advanceNote", () => {
  it("resume cuántos de cada uno se aplicaron", () => {
    expect(advanceNote({ anticipoApplications: [1, 2], bonoApplications: [1] })).toBe(
      "Anticipos 2 · Bonos 1",
    );
    expect(advanceNote({ anticipoApplications: [1], bonoApplications: [] })).toBe("Anticipos 1");
    expect(advanceNote({ anticipoApplications: [], bonoApplications: [1] })).toBe("Bonos 1");
    expect(advanceNote({})).toBe("");
  });
});
