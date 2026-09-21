import { describe, it, expect } from "vitest";
import {
  cleanText,
  rutWithDvNoDash,
  bchileAccountTypeCode,
  aggregateWorkerAmounts,
  validateAccountNumber,
  splitBankAndCash,
  normalizeLeader,
  groupCashByLeader,
  buildBchileRows,
} from "./payroll";

const wd = (over = {}) => ({
  id: "c1__l1__1-9__2026-01-01",
  cycleId: "c1",
  laborId: "l1",
  workerRut: "1-9",
  workerId: "1-9",
  date: "2026-01-01",
  amount: 1000,
  ...over,
});

describe("aggregateWorkerAmounts", () => {
  // Esto ES el bruto de la nómina: lo que sale de acá es contra lo que se
  // descuentan anticipos y lo que termina en la transferencia.
  const tipos = new Map([
    ["l1", "cosecha"],
    ["lTrato", "trato"],
  ]);

  it("suma por trabajador y desglosa por ciclo", () => {
    const [ana] = aggregateWorkerAmounts(
      [
        wd({ id: "a", amount: 1000, cycleId: "c1" }),
        wd({ id: "b", amount: 500, cycleId: "c1" }),
        wd({ id: "c", amount: 2000, cycleId: "c2" }),
      ],
      tipos,
    );
    expect(ana.total).toBe(3500);
    expect(ana.byCycle).toEqual({ c1: 1500, c2: 2000 });
    expect(ana.workdayIds).toEqual(["a", "b", "c"]);
  });

  it("separa trabajadores por workerRut", () => {
    const res = aggregateWorkerAmounts(
      [wd({ workerRut: "1-9" }), wd({ workerRut: "2-7", amount: 300 })],
      tipos,
    );
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.total).sort((a, b) => a - b)).toEqual([300, 1000]);
  });

  it("usa getTratoTierTotals para labores a trato", () => {
    const [r] = aggregateWorkerAmounts(
      [wd({ laborId: "lTrato", amount: 7777, tiers: { t0: { amount: 10 }, t1: { amount: 20 } } })],
      tipos,
    );
    // Dos tiers → se suman los tiers y el top-level se ignora.
    expect(r.total).toBe(30);
  });

  it("descarta workdays sin rut", () => {
    expect(aggregateWorkerAmounts([wd({ workerRut: "" })], tipos)).toEqual([]);
  });

  it("no rompe con una labor que no está en el mapa de tipos", () => {
    const [r] = aggregateWorkerAmounts([wd({ laborId: "desconocida", amount: 400 })], tipos);
    expect(r.total).toBe(400);
  });

  it("acumula workerId del primer workday que ve", () => {
    const [r] = aggregateWorkerAmounts(
      [wd({ workerId: "1-9", amount: 100 }), wd({ workerId: "otro", amount: 100 })],
      tipos,
    );
    expect(r.workerId).toBe("1-9");
  });

  // Los días en cero entran. Antes se descartaban antes de llegar a
  // `workdayIds`, así que nunca se etiquetaban con `payrollId` y quedaban
  // disponibles para siempre: las cifras de "pagado / pendiente" del ciclo no
  // cerraban nunca.
  it("un workday en 0 entra igual en workdayIds", () => {
    const res = aggregateWorkerAmounts(
      [wd({ id: "cero", amount: 0 }), wd({ id: "vale", amount: 100 })],
      tipos,
    );
    expect(res[0].workdayIds).toEqual(["cero", "vale"]);
    expect(res[0].total).toBe(100);
  });

  it("un trabajador con todos los días en 0 aparece con total 0", () => {
    // Es el caso del sueldo mensual que marca asistencia: hay que poder
    // etiquetarle los días como pagados aunque no genere transferencia.
    const res = aggregateWorkerAmounts([wd({ id: "asist", amount: 0 })], tipos);
    expect(res).toHaveLength(1);
    expect(res[0].total).toBe(0);
    expect(res[0].workdayIds).toEqual(["asist"]);
  });

  it("ese trabajador no llega al archivo del banco", () => {
    // La otra mitad de la regla: entra a la nómina para que sus días queden
    // marcados, pero el banco rechaza una transferencia de $0.
    const [r] = aggregateWorkerAmounts([wd({ id: "asist", amount: 0 })], tipos);
    const filas = buildBchileRows([
      { rut: r.rut, name: "Mensual", amount: r.total, accountNumber: "1", accountType: 3, bankCode: "012" },
    ]);
    expect(filas).toEqual([]);
  });

  it("los montos negativos sí entran (no hay guard)", () => {
    const [r] = aggregateWorkerAmounts([wd({ amount: -500 })], tipos);
    expect(r.total).toBe(-500);
  });
});

describe("validateAccountNumber", () => {
  // Último filtro antes de que una transferencia salga a una cuenta escrita mal.
  it("no valida nada cuando el pago es en efectivo", () => {
    expect(validateAccountNumber("", "EFE")).toBe(null);
    expect(validateAccountNumber("basura!!", "efe")).toBe(null);
  });

  it("acepta cuentas razonables", () => {
    expect(validateAccountNumber("12345678", "012")).toBe(null);
    expect(validateAccountNumber("1234-5678", "001")).toBe(null);
  });

  it("rechaza vacía, no numérica, corta, larga y todo ceros", () => {
    expect(validateAccountNumber("", "012")).toBe("cuenta vacía");
    expect(validateAccountNumber("   ", "012")).toBe("cuenta vacía");
    expect(validateAccountNumber("12a45", "012")).toBe("contiene caracteres no numéricos");
    expect(validateAccountNumber("123", "012")).toBe("muy corta (<4 dígitos)");
    expect(validateAccountNumber("1".repeat(21), "012")).toBe("demasiado larga");
    expect(validateAccountNumber("0000", "012")).toBe("todo ceros");
  });

  it("los guiones no cuentan para el largo", () => {
    expect(validateAccountNumber("1-2-3", "012")).toBe("muy corta (<4 dígitos)");
    expect(validateAccountNumber("1-2-3-4", "012")).toBe(null);
  });
});

describe("splitBankAndCash", () => {
  it("manda a efectivo solo el código EFE", () => {
    const items = [
      { rut: "1-9", bankCode: "EFE" },
      { rut: "2-7", bankCode: "012" },
      { rut: "3-5", bankCode: "" },
      { rut: "4-3", bankCode: undefined },
    ];
    const { bank, cash } = splitBankAndCash(items);
    expect(cash.map((i) => i.rut)).toEqual(["1-9"]);
    // Sin código de banco NO se asume efectivo: cae al lado de transferencia,
    // donde después validateAccountNumber lo marca como dato faltante.
    expect(bank.map((i) => i.rut)).toEqual(["2-7", "3-5", "4-3"]);
  });

  it("no pierde ni duplica items", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      rut: String(i),
      bankCode: i % 3 === 0 ? "EFE" : "012",
    }));
    const { bank, cash } = splitBankAndCash(items);
    expect(bank.length + cash.length).toBe(items.length);
  });
});

describe("normalizeLeader / groupCashByLeader", () => {
  it("fusiona líderes que solo difieren en mayúsculas o espacios", () => {
    // Un bug acá parte el sobre de un líder en dos y el conteo de billetes
    // sale mal.
    expect(normalizeLeader(" grupo oliver ")).toBe("GRUPO OLIVER");
    const grupos = groupCashByLeader([
      { rut: "1-9", groupLeader: "Grupo Oliver", amount: 1000 },
      { rut: "2-7", groupLeader: "GRUPO OLIVER", amount: 2000 },
      { rut: "3-5", groupLeader: " grupo oliver", amount: 500 },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].total).toBe(3500);
    expect(grupos[0].items).toHaveLength(3);
  });

  it("junta a los que no tienen líder en un grupo propio", () => {
    const grupos = groupCashByLeader([
      { rut: "1-9", groupLeader: "", amount: 100 },
      { rut: "2-7", groupLeader: null, amount: 200 },
      { rut: "3-5", amount: 300 },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].leader).toBe("Sin líder");
    expect(grupos[0].total).toBe(600);
  });

  it("ordena alfabéticamente para que el orden de impresión sea estable", () => {
    const grupos = groupCashByLeader([
      { groupLeader: "ZETA", amount: 1 },
      { groupLeader: "ALFA", amount: 1 },
      { groupLeader: "MEDIO", amount: 1 },
    ]);
    expect(grupos.map((g) => g.leader)).toEqual(["ALFA", "MEDIO", "ZETA"]);
  });

  it("los montos no numéricos suman cero en vez de dar NaN", () => {
    const [g] = groupCashByLeader([
      { groupLeader: "A", amount: "x" },
      { groupLeader: "A", amount: 500 },
    ]);
    expect(g.total).toBe(500);
  });
});

describe("rutWithDvNoDash", () => {
  it("pega el dígito verificador y saca puntos", () => {
    expect(rutWithDvNoDash("12.345.678-5")).toBe("123456785");
    expect(rutWithDvNoDash("12345670-K")).toBe("12345670K");
    expect(rutWithDvNoDash("1234567-B")).toBe("1234567B");
  });

  it("limpia igual lo que no tiene forma de RUT", () => {
    expect(rutWithDvNoDash("TEMP-abc")).toBe("TEMPABC");
    expect(rutWithDvNoDash("")).toBe("");
  });
});

describe("bchileAccountTypeCode", () => {
  it("mapea los tipos conocidos", () => {
    expect(bchileAccountTypeCode(0)).toBe("CTD"); // corriente
    expect(bchileAccountTypeCode(1)).toBe("JUV"); // vista
    expect(bchileAccountTypeCode(3)).toBe("JUV"); // cuenta RUT
    expect(bchileAccountTypeCode("0")).toBe("CTD");
  });

  it("cae a JUV en silencio con un tipo desconocido", () => {
    // Vale la pena tenerlo fijado: un tipo nuevo mal cargado se envía como
    // cuenta vista sin que nada avise.
    expect(bchileAccountTypeCode(99)).toBe("JUV");
    expect(bchileAccountTypeCode(undefined)).toBe("JUV");
  });
});

describe("cleanText", () => {
  it("saca acentos y deja solo ASCII, que es lo que acepta el banco", () => {
    expect(cleanText("José Muñoz Ñandú")).toBe("Jose Munoz Nandu");
    expect(cleanText("O'Brien-Smith")).toBe("O Brien Smith");
    expect(cleanText("  doble   espacio  ")).toBe("doble espacio");
    expect(cleanText("")).toBe("");
    expect(cleanText(null)).toBe("");
  });
});
