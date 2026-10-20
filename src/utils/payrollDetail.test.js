import { describe, it, expect } from "vitest";
import {
  payrollLeadersOf,
  filterPayrollItems,
  detailSummariesOf,
  subfaenaSummaryOf,
  cyclesPeriodOf,
  summaryDisplayRowsOf,
  removalSummaryOf,
} from "./payrollDetail";
import { groupCashByLeader } from "./payroll";

const ANA = { rut: "11111111-1", workerId: "11111111-1", name: "Ana Pérez", groupLeader: "grupo a ", bankCode: "012", amount: 120000, byCycle: { C1: 120000, C2: 0 } };
const BETO = { rut: "12345678-5", workerId: "12345678-5", name: "Beto Soto", groupLeader: "GRUPO A", bankCode: "EFE", amount: 35000, byCycle: { C1: 35000 } };
const CARO = { rut: "12345670-K", workerId: "W-CARO", name: "Caro Díaz", groupLeader: "", bankCode: "012", amount: 70000, byCycle: { C2: 70000 } };
const items = [ANA, BETO, CARO];

describe("payrollLeadersOf", () => {
  it("cuenta las personas por líder, normalizado, con SIN GRUPO para quien no tiene", () => {
    expect(payrollLeadersOf(items)).toEqual([
      { leader: "GRUPO A", count: 2 },
      { leader: "SIN GRUPO", count: 1 },
    ]);
    expect(payrollLeadersOf([])).toEqual([]);
  });
});

describe("filterPayrollItems", () => {
  const base = { search: "", paymentMethod: "all", activeLeaderFilter: new Set(), activeCycleFilter: new Set(), rutOf: (rut) => rut };
  const names = (opts) => filterPayrollItems(items, { ...base, ...opts }).map((it) => it.name);

  it("sin filtros devuelve todo", () => {
    expect(names({})).toEqual(["Ana Pérez", "Beto Soto", "Caro Díaz"]);
  });

  it("busca en el RUT, el RUT vigente, el nombre y el líder, sin tildes ni mayúsculas", () => {
    expect(names({ search: "  diaz " })).toEqual(["Caro Díaz"]);
    expect(names({ search: "12345678" })).toEqual(["Beto Soto"]);
    expect(names({ search: "grupo a" })).toEqual(["Ana Pérez", "Beto Soto"]);
    // El RUT vigente sale del resolvedor, con el id del trabajador.
    expect(names({ search: "99999999", rutOf: (rut, id) => (id === "W-CARO" ? "99999999-9" : rut) })).toEqual(["Caro Díaz"]);
  });

  it("separa banco y efectivo", () => {
    expect(names({ paymentMethod: "bank" })).toEqual(["Ana Pérez", "Caro Díaz"]);
    expect(names({ paymentMethod: "cash" })).toEqual(["Beto Soto"]);
  });

  it("filtra por líder y por ciclos con monto", () => {
    expect(names({ activeLeaderFilter: new Set(["SIN GRUPO"]) })).toEqual(["Caro Díaz"]);
    // Ana tiene C2 en 0: no cuenta como parte de ese ciclo.
    expect(names({ activeCycleFilter: new Set(["C2"]) })).toEqual(["Caro Díaz"]);
    expect(names({ activeCycleFilter: new Set(["C1", "C2"]), paymentMethod: "bank" })).toEqual(["Ana Pérez", "Caro Díaz"]);
  });
});

describe("detailSummariesOf", () => {
  const cycleDetails = [
    { id: "C1", faenaName: "Fundo Norte", label: "Norte/S1/Ciclo 1" },
    { id: "C2", label: "Sur/S2/Ciclo 1" },
  ];

  it("separa Con cuenta RUT del resto y reparte cada líder por faena", () => {
    const groups = groupCashByLeader([
      { ...ANA, groupLeader: "Extranjeros con cuenta RUT", byCycle: { C1: 50000, C2: 10000 } },
      { ...BETO, groupLeader: "chilenos" },
      { ...CARO, groupLeader: "GRUPO B", byCycle: { C2: 70000, C9: 5000 } },
    ]);
    expect(detailSummariesOf(groups, cycleDetails)).toEqual([
      {
        title: "Con cuenta RUT",
        rows: [
          { leader: "CHILENOS", total: 35000, byFaena: [{ faenaName: "Fundo Norte", total: 35000 }] },
          // Sin faena guardada, la faena es la etiqueta del ciclo.
          { leader: "EXTRANJEROS CON CUENTA RUT", total: 120000, byFaena: [{ faenaName: "Fundo Norte", total: 50000 }, { faenaName: "Sur/S2/Ciclo 1", total: 10000 }] },
        ],
        total: 155000,
      },
      {
        title: "Otros grupos",
        // Un ciclo que no está en la nómina cae en "—".
        rows: [{ leader: "GRUPO B", total: 70000, byFaena: [{ faenaName: "—", total: 5000 }, { faenaName: "Sur/S2/Ciclo 1", total: 70000 }] }],
        total: 70000,
      },
    ]);
  });

  it("sin grupos de un lado, esa tabla no va", () => {
    expect(detailSummariesOf(groupCashByLeader([BETO]), undefined).map((t) => t.title)).toEqual(["Otros grupos"]);
    expect(detailSummariesOf([], cycleDetails)).toEqual([]);
  });
});

describe("subfaenaSummaryOf", () => {
  it("suma banco y efectivo por subfaena, ordenada por faena y subfaena, sin las que quedan en 0", () => {
    const cycleDetails = [
      { id: "C1", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B" },
      { id: "C3", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B" },
      { id: "C2", subfaenaId: "S2", subfaenaName: "Sector Dos", faenaName: "Fundo A" },
      { id: "C4", label: "Suelto/Ciclo 4" },
      { id: "C5", subfaenaId: "S5", subfaenaName: "Vacía", faenaName: "Fundo A" },
    ];
    const bank = [{ byCycle: { C1: 100, C3: 50, C2: 0 } }, { byCycle: { C2: 30 } }];
    const cash = [{ byCycle: { C1: 20, C4: 7 } }];
    const { rows, totals } = subfaenaSummaryOf(cycleDetails, bank, cash);
    expect(rows.map((r) => [r.faenaName, r.subfaenaName, [...r.cycleIds], r.bank, r.cash, r.total])).toEqual([
      ["—", "Suelto/Ciclo 4", ["C4"], 0, 7, 7],
      ["Fundo A", "Sector Dos", ["C2"], 30, 0, 30],
      ["Fundo B", "Sector Uno", ["C1", "C3"], 150, 20, 170],
    ]);
    expect(totals).toEqual({ bank: 180, cash: 27, total: 207 });
  });
});

describe("cyclesPeriodOf", () => {
  const cycleDetails = [
    { id: "C1", firstDay: "2026-10-02", lastDay: "2026-10-05" },
    { id: "C2", firstDay: "2026-09-28", lastDay: "2026-10-01" },
    { id: "C3", firstDay: "2026-10-07", lastDay: "2026-10-07" },
    { id: "C4" },
  ];

  it("va del primer día al último de los ciclos pedidos", () => {
    expect(cyclesPeriodOf(cycleDetails, ["C1", "C2"])).toBe("28/09 → 05/10");
    expect(cyclesPeriodOf(cycleDetails, ["C3"])).toBe("07/10");
    expect(cyclesPeriodOf(cycleDetails, ["C4", "C9"])).toBe("—");
  });
});

describe("summaryDisplayRowsOf", () => {
  const rows = [
    { faenaName: "Fundo A", subfaenaName: "S1", bank: 10, cash: 5, total: 15 },
    { faenaName: "Fundo A", subfaenaName: "S1", bank: 1, cash: 0, total: 1 },
    { faenaName: "Fundo B", subfaenaName: "S3", bank: 0, cash: 4, total: 4 },
  ];

  it("pone el nombre al empezar cada faena y un subtotal al cerrarla", () => {
    expect(summaryDisplayRowsOf({ rows }, false)).toEqual([
      { row: rows[0], showLabel: true },
      { row: rows[1], showLabel: false },
      { subtotal: { bank: 11, cash: 5, total: 16 } },
      { row: rows[2], showLabel: true },
      { subtotal: { bank: 0, cash: 4, total: 4 } },
    ]);
  });

  it("con labores, el nombre va al cambiar de subfaena", () => {
    const withLabor = [rows[0], { ...rows[1], subfaenaName: "S2" }];
    expect(summaryDisplayRowsOf({ rows: withLabor }, true).map((e) => e.showLabel)).toEqual([true, true, undefined]);
    expect(summaryDisplayRowsOf(null, false)).toEqual([]);
  });
});

describe("removalSummaryOf", () => {
  const breakdown = [
    { id: "C1", label: "Ciclo 1", amount: 100, labors: [{ id: "L1", name: "Cosecha", amount: 60 }, { id: "L2", name: "Supervisión", amount: 40 }] },
    { id: "C2", label: "Ciclo 2", amount: 70, labors: [{ id: "L1", name: "Poda", amount: null }, { id: "L3", name: "Amarre", amount: 5 }] },
  ];

  it("cuenta ciclos enteros y labores sueltas, con su bruto", () => {
    const out = removalSummaryOf(breakdown, new Map([["C1", true], ["C2", new Set(["L3"])]]));
    expect(out).toEqual({ cyclesOut: 1, laborsOut: 1, amount: 105, unknown: false, lines: ["Ciclo 1 (ciclo entero)", "Ciclo 2: Amarre"], allOut: false });
  });

  it("una labor sin monto conocido lo marca, y sacar todos los ciclos deja la nómina vacía", () => {
    expect(removalSummaryOf(breakdown, new Map([["C2", new Set(["L1"])]])).unknown).toBe(true);
    expect(removalSummaryOf(breakdown, new Map([["C1", true], ["C2", true]])).allOut).toBe(true);
    expect(removalSummaryOf([], new Map()).allOut).toBe(false);
  });
});
