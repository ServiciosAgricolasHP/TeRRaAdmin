import { describe, it, expect } from "vitest";
import {
  advancesAndBonusesOf,
  lastEditLabel,
  payrollLeadersOf,
  filterPayrollItems,
  detailSummariesOf,
  subfaenaSummaryOf,
  cyclesPeriodOf,
  summaryDisplayRowsOf,
  computeLaborSummary,
  summaryLabelColumnsOf,
  summaryCycleName,
  summaryTitleOf,
  netPartsOf,
  netByCycleOf,
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

describe("netPartsOf", () => {
  it("descuenta el anticipo desde la parte más grande y sigue con la siguiente cuando llega a cero", () => {
    expect(netPartsOf([20000, 80000], { advance: 30000 })).toEqual([20000, 50000]);
    expect(netPartsOf([20000, 80000], { advance: 90000 })).toEqual([10000, 0]);
    expect(netPartsOf([20000, 80000], { advance: 100000 })).toEqual([0, 0]);
  });

  it("el bono entra entero a la parte más grande, antes del anticipo", () => {
    expect(netPartsOf([20000, 80000], { bonus: 5000 })).toEqual([20000, 85000]);
    expect(netPartsOf([20000, 80000], { bonus: 5000, advance: 85000 })).toEqual([20000, 0]);
    // Todas en $0: el bono va a la parte preferida.
    expect(netPartsOf([0, 0], { bonus: 20000, preferred: 1 })).toEqual([0, 20000]);
    expect(netPartsOf([], { bonus: 20000 })).toEqual([]);
  });
});

describe("netByCycleOf", () => {
  it("da lo que se paga por ciclo, y quien suma $0 lleva su bono al ciclo de sus jornadas", () => {
    expect(netByCycleOf({ byCycle: { C1: 20000, C2: 80000 }, advance: 30000, bonus: 0 })).toEqual({ C1: 20000, C2: 50000 });
    expect(netByCycleOf({ byCycle: { C1: 0, C2: 0 }, bonus: 20000, workdayIds: ["C2__L1__1-9__2026-10-01"] })).toEqual({ C1: 0, C2: 20000 });
  });
});

describe("subfaenaSummaryOf: lo que se paga", () => {
  const cycleDetails = [
    { id: "C1", label: "F/S1/Ciclo 1", faenaName: "F", subfaenaId: "S1", subfaenaName: "S1" },
    { id: "C2", label: "F/S2/Ciclo 1", faenaName: "F", subfaenaId: "S2", subfaenaName: "S2" },
  ];
  const ana = { rut: "1-9", byCycle: { C1: 20000, C2: 80000 }, advance: 30000, bonus: 0 };
  const beto = { rut: "2-7", byCycle: { C1: 15000, C2: 0 }, advance: 15000, bonus: 0 };

  it("con `net` cada fila trae los anticipos descontados y cuadra con el total a pagar", () => {
    const { rows, totals } = subfaenaSummaryOf(cycleDetails, [ana], [beto], { net: true });
    expect(rows.map((r) => [r.subfaenaName, r.bank, r.cash, r.total])).toEqual([
      ["S1", 20000, 0, 20000],
      ["S2", 50000, 0, 50000],
    ]);
    expect(totals).toEqual({ bank: 70000, cash: 0, total: 70000 });
    // Sin `net`, el bruto de siempre.
    expect(subfaenaSummaryOf(cycleDetails, [ana], [beto]).totals.total).toBe(115000);
  });

  it("la fila que un anticipo dejó en $0 sigue en la tabla", () => {
    const { rows } = subfaenaSummaryOf(cycleDetails, [], [beto], { net: true });
    expect(rows.map((r) => [r.subfaenaName, r.total])).toEqual([["S1", 0]]);
  });
});

describe("computeLaborSummary: lo que se paga", () => {
  it("con `net` descuenta el anticipo de cada persona entre sus labores, desde la más grande", () => {
    const cycleDetails = [{ id: "C1", label: "F/S1/Ciclo 1", faenaName: "F", subfaenaId: "S1", subfaenaName: "S1" }];
    const allGroups = [{ leader: "G", items: [
      { rut: "A", bankCode: "012", advance: 90000, bonus: 5000 },
      { rut: "B", bankCode: "EFE", advance: 0, bonus: 0 },
    ] }];
    const workdaysByGroup = { G: { C1: [
      { laborName: "Poda", rows: [{ rut: "A", totalAmount: 80000 }, { rut: "B", totalAmount: 30000 }] },
      { laborName: "Amarre", rows: [{ rut: "A", totalAmount: 20000 }] },
    ] } };
    const net = computeLaborSummary({ cycleDetails }, allGroups, workdaysByGroup, { net: true });
    // A: Poda 80.000 + bono 5.000 − 85.000 = 0; Amarre 20.000 − 5.000 = 15.000.
    expect(net.rows.map((r) => [r.laborName, r.bank, r.cash, r.total])).toEqual([
      ["Amarre", 15000, 0, 15000],
      ["Poda", 0, 30000, 30000],
    ]);
    expect(net.totals.total).toBe(45000);
    expect(computeLaborSummary({ cycleDetails }, allGroups, workdaysByGroup).totals.total).toBe(130000);
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

describe("ciclos juntos o separados en el resumen", () => {
  const cycleDetails = [
    { id: "C3", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B", label: "Fundo B/Sector Uno/Ciclo 3", firstDay: "2026-10-10" },
    { id: "C1", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B", label: "Fundo B/Sector Uno/Ciclo 1", firstDay: "2026-10-01" },
    { id: "C9", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B", label: "Fundo B/Sector Uno/Ciclo 9", firstDay: "2026-10-20" },
    { id: "C2", subfaenaId: "S2", subfaenaName: "Sector Dos", faenaName: "Fundo B", label: "Fundo B/Sector Dos/Ciclo 1", firstDay: "2026-10-02" },
  ];
  const bank = [{ byCycle: { C1: 100, C3: 50, C9: 0 } }];
  const cash = [{ byCycle: { C2: 30, C3: 5 } }];
  const cycleNameOf = (cd) => summaryCycleName(cd, { C3: "Repaso" });

  it("el nombre del ciclo es el editado o la etiqueta sin faena ni subfaena", () => {
    expect(summaryCycleName(cycleDetails[1])).toBe("Ciclo 1");
    expect(summaryCycleName(cycleDetails[0], { C3: "Repaso" })).toBe("Repaso");
    expect(summaryCycleName({ id: "C7", label: "Suelto/Ciclo 7" })).toBe("Suelto/Ciclo 7");
    expect(summaryCycleName({ id: "C8" })).toBe("C8");
  });

  it("juntos, la fila dice cuántos ciclos con monto junta y cuáles", () => {
    const { rows } = subfaenaSummaryOf(cycleDetails, bank, cash, { cycleNameOf });
    expect(rows.map((r) => [r.subfaenaName, r.cycleCount, r.cycleNames, r.total])).toEqual([
      ["Sector Dos", 1, ["Ciclo 1"], 30],
      ["Sector Uno", 2, ["Ciclo 1", "Repaso"], 155],
    ]);
  });

  it("separados, una fila por ciclo con monto, por su primer día, y los mismos totales", () => {
    const joined = subfaenaSummaryOf(cycleDetails, bank, cash, { cycleNameOf });
    const apart = subfaenaSummaryOf(cycleDetails, bank, cash, { byCycle: true, cycleNameOf });
    expect(apart.rows.map((r) => [r.subfaenaName, r.cycleName, [...r.cycleIds], r.cycleCount, r.bank, r.cash])).toEqual([
      ["Sector Dos", "Ciclo 1", ["C2"], 1, 0, 30],
      ["Sector Uno", "Ciclo 1", ["C1"], 2, 100, 0],
      ["Sector Uno", "Repaso", ["C3"], 2, 50, 5],
    ]);
    expect(apart.totals).toEqual(joined.totals);
  });

  it("el resumen por labor también se separa por ciclo", () => {
    const allGroups = [{ leader: "G", items: [{ rut: "A", bankCode: "012" }] }];
    const workdaysByGroup = { G: {
      C3: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 50 }] }],
      C1: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 100 }] }, { laborName: "Amarre", rows: [{ rut: "A", totalAmount: 10 }] }],
    } };
    const joined = computeLaborSummary({ cycleDetails }, allGroups, workdaysByGroup, { cycleNameOf });
    expect(joined.rows.map((r) => [r.laborName, r.cycleCount, r.cycleNames, r.total])).toEqual([
      ["Amarre", 1, ["Ciclo 1"], 10],
      ["Poda", 2, ["Repaso", "Ciclo 1"], 150],
    ]);
    const apart = computeLaborSummary({ cycleDetails }, allGroups, workdaysByGroup, { byCycle: true, cycleNameOf });
    expect(apart.rows.map((r) => [r.cycleName, r.laborName, r.total])).toEqual([
      ["Ciclo 1", "Amarre", 10],
      ["Ciclo 1", "Poda", 100],
      ["Repaso", "Poda", 50],
    ]);
  });

  it("la tabla: juntos marca la fila que junta ciclos; separados agrega la columna Ciclo", () => {
    const periodOf = () => "—";
    const joined = summaryDisplayRowsOf(subfaenaSummaryOf(cycleDetails, bank, cash, { cycleNameOf }), { showLabor: false, periodOf });
    expect(joined.filter((e) => e.row).map((e) => [e.labels, e.notes, e.noteTitle])).toEqual([
      [["Fundo B", "Sector Dos", "—"], undefined, undefined],
      [["", "Sector Uno", "—"], { subfaena: "2 ciclos" }, "Junta Ciclo 1, Repaso"],
    ]);
    expect(summaryTitleOf({ showLabor: false, byCycle: true })).toBe("por ciclo");
    expect(summaryTitleOf({ showLabor: true, gross: true })).toBe("por labor (bruto)");
    expect(summaryLabelColumnsOf({ showLabor: false, byCycle: true }).map((c) => c.label)).toEqual(["Faena", "Subfaena", "Ciclo", "Período"]);
    const apart = summaryDisplayRowsOf(subfaenaSummaryOf(cycleDetails, bank, cash, { byCycle: true, cycleNameOf }), { showLabor: false, byCycle: true, periodOf });
    expect(apart.map((e) => e.labels || "subtotal")).toEqual([
      ["Fundo B", "Sector Dos", "Ciclo 1", "—"],
      ["", "Sector Uno", "Ciclo 1", "—"],
      ["", "", "Repaso", "—"],
      "subtotal",
    ]);
  });

  it("con labores: juntos la marca va en la labor; separados el ciclo va al empezar cada uno", () => {
    const periodOf = () => "—";
    const allGroups = [{ leader: "G", items: [{ rut: "A", bankCode: "012" }] }];
    const workdaysByGroup = { G: {
      C3: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 50 }] }],
      C1: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 100 }] }, { laborName: "Amarre", rows: [{ rut: "A", totalAmount: 10 }] }],
    } };
    const joined = summaryDisplayRowsOf(computeLaborSummary({ cycleDetails }, allGroups, workdaysByGroup, { cycleNameOf }), { showLabor: true, periodOf });
    expect(joined.filter((e) => e.row).map((e) => e.notes)).toEqual([undefined, { labor: "2 ciclos" }]);
    const apart = summaryDisplayRowsOf(
      computeLaborSummary({ cycleDetails }, allGroups, workdaysByGroup, { byCycle: true, cycleNameOf }),
      { showLabor: true, byCycle: true, periodOf },
    );
    expect(summaryLabelColumnsOf({ showLabor: true, byCycle: true }).map((c) => c.label)).toEqual(["Faena", "Subfaena", "Ciclo", "Labor", "Período"]);
    expect(apart.filter((e) => e.row).map((e) => e.labels)).toEqual([
      ["Fundo B", "Sector Uno", "Ciclo 1", "Amarre", "—"],
      ["", "", "", "Poda", "—"],
      ["", "", "Repaso", "Poda", "—"],
    ]);
  });
});

describe("computeLaborSummary", () => {
  it("suma por subfaena y labor, separando banco y efectivo, sin filas en 0", () => {
    const payroll = {
      cycleDetails: [
        { id: "C1", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B" },
        { id: "C3", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B" },
        { id: "C2", subfaenaId: "S2", subfaenaName: "Sector Dos", faenaName: "Fundo A" },
      ],
    };
    const allGroups = [{ leader: "G", items: [{ rut: "A", bankCode: "012" }, { rut: "B", bankCode: "EFE" }] }];
    const workdaysByGroup = {
      G: {
        C1: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 100 }, { rut: "B", totalAmount: 20 }] }],
        C3: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 50 }] }, { laborName: "Amarre", rows: [{ rut: "B", totalAmount: 0 }] }],
        C2: [{ laborName: "Raleo", rows: [{ rut: "B", totalAmount: 30 }] }],
      },
    };
    const { rows, totals } = computeLaborSummary(payroll, allGroups, workdaysByGroup);
    expect(rows.map((r) => [r.faenaName, r.subfaenaName, r.laborName, [...r.cycleIds], r.bank, r.cash, r.total])).toEqual([
      ["Fundo A", "Sector Dos", "Raleo", ["C2"], 0, 30, 30],
      ["Fundo B", "Sector Uno", "Poda", ["C1", "C3"], 150, 20, 170],
    ]);
    expect(totals).toEqual({ bank: 150, cash: 50, total: 200 });
  });

  it("junta la subfaena por su id, con el nombre de su primer ciclo, aunque un ciclo traiga otro", () => {
    const payroll = {
      cycleDetails: [
        { id: "C1", subfaenaId: "S1", subfaenaName: "Sector Uno", faenaName: "Fundo B" },
        { id: "C3", subfaenaId: "S1", subfaenaName: "Sector Norte", faenaName: "Fundo B" },
        { id: "C4", subfaenaId: "S4", subfaenaName: "Sector Uno", faenaName: "Fundo B" },
      ],
    };
    const allGroups = [{ leader: "G", items: [{ rut: "A", bankCode: "012" }] }];
    const workdaysByGroup = { G: {
      C1: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 100 }] }],
      C3: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 50 }] }],
      C4: [{ laborName: "Poda", rows: [{ rut: "A", totalAmount: 7 }] }],
    } };
    expect(computeLaborSummary(payroll, allGroups, workdaysByGroup).rows.map((r) => [r.subfaenaName, [...r.cycleIds], r.total])).toEqual([
      ["Sector Uno", ["C1", "C3"], 150],
      ["Sector Uno", ["C4"], 7],
    ]);
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
    { faenaName: "Fundo A", subfaenaName: "S1", laborName: "Poda", cycleIds: new Set(["C1"]), bank: 10, cash: 5, total: 15 },
    { faenaName: "Fundo A", subfaenaName: "S1", laborName: "Raleo", cycleIds: new Set(["C1"]), bank: 1, cash: 0, total: 1 },
    { faenaName: "Fundo B", subfaenaName: "S3", laborName: "Poda", cycleIds: new Set(["C3"]), bank: 0, cash: 4, total: 4 },
  ];
  const periodOf = (ids) => [...ids].join("+");

  it("pone el nombre al empezar cada faena y un subtotal al cerrarla", () => {
    expect(summaryLabelColumnsOf({ showLabor: false }).map((c) => c.label)).toEqual(["Faena", "Subfaena", "Período"]);
    expect(summaryDisplayRowsOf({ rows }, { showLabor: false, periodOf })).toEqual([
      { row: rows[0], labels: ["Fundo A", "S1", "C1"] },
      { row: rows[1], labels: ["", "S1", "C1"] },
      { subtotal: { bank: 11, cash: 5, total: 16 } },
      { row: rows[2], labels: ["Fundo B", "S3", "C3"] },
      { subtotal: { bank: 0, cash: 4, total: 4 } },
    ]);
  });

  it("con labores, faena y subfaena van al cambiar de subfaena", () => {
    const withLabor = [rows[0], { ...rows[1], subfaenaName: "S2" }];
    expect(summaryLabelColumnsOf({ showLabor: true }).map((c) => c.label)).toEqual(["Faena", "Subfaena", "Labor", "Período"]);
    expect(summaryDisplayRowsOf({ rows: withLabor }, { showLabor: true, periodOf }).map((e) => e.labels)).toEqual([
      ["Fundo A", "S1", "Poda", "C1"],
      ["Fundo A", "S2", "Raleo", "C1"],
      undefined,
    ]);
    expect(summaryDisplayRowsOf(null, { showLabor: false, periodOf })).toEqual([]);
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

describe("advancesAndBonusesOf", () => {
  const items = [
    { rut: "2-7", name: "Bruno Díaz", anticipoApplications: [{ advanceId: "a2", amount: 20000 }, { advanceId: "a3", amount: 0 }] },
    { rut: "1-9", name: "Ana Pérez", anticipoApplications: [{ advanceId: "a1", amount: 30000, maxAmount: 50000 }], bonoApplications: [{ advanceId: "b1", amount: 15000 }] },
    { rut: "3-5", name: "Carla Soto" },
  ];
  const advances = [
    { id: "a1", type: "anticipo", date: "2026-10-03", note: "Gas" },
    { id: "a2", type: "anticipo", date: "2026-10-01", note: "" },
    { id: "b1", type: "bono", date: "2026-10-08", note: "Asistencia" },
  ];

  it("lista lo que aplicó la nómina por persona, con la fecha y la nota de cada uno", () => {
    const r = advancesAndBonusesOf(items, advances);
    expect(r.advances.map((x) => [x.name, x.date, x.note, x.amount])).toEqual([
      ["Ana Pérez", "2026-10-03", "Gas", 30000],
      ["Bruno Díaz", "2026-10-01", "", 20000],
    ]);
    expect(r.bonuses.map((x) => [x.name, x.note, x.amount])).toEqual([["Ana Pérez", "Asistencia", 15000]]);
    expect([r.advanceTotal, r.bonusTotal]).toEqual([50000, 15000]);
  });

  it("sin el snapshot, las filas van sin fecha ni nota", () => {
    const r = advancesAndBonusesOf(items, undefined);
    expect(r.advances.map((x) => [x.date, x.note])).toEqual([["", ""], ["", ""]]);
    expect(advancesAndBonusesOf([], []).advanceTotal).toBe(0);
  });
});

describe("lastEditLabel", () => {
  const now = new Date("2026-11-05T15:40:00-03:00");
  const at = (iso) => ({ seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 });

  it("dice cuándo se editó y quién", () => {
    const payroll = { updatedAt: at("2026-11-05T15:35:00-03:00"), updatedByName: "Ana" };
    expect(lastEditLabel(payroll, now)).toBe("Última edición: hace 5 min · Ana");
  });

  it("sin quién, solo cuándo; desde la semana, la fecha", () => {
    expect(lastEditLabel({ updatedAt: at("2026-10-20T09:00:00-03:00") }, now)).toBe("Última edición: 20-10-2026");
  });

  it("acepta un Timestamp de Firestore", () => {
    const payroll = { updatedAt: { toMillis: () => Date.parse("2026-11-05T13:40:00-03:00") }, updatedByName: "demo@terra.test" };
    expect(lastEditLabel(payroll, now)).toBe("Última edición: hace 2 h · demo@terra.test");
  });

  it("sin updatedAt, null", () => {
    expect(lastEditLabel({ updatedByName: "Ana" }, now)).toBeNull();
    expect(lastEditLabel(null, now)).toBeNull();
  });
});
