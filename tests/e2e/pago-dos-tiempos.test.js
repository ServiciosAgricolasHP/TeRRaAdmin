import { describe, it, expect } from "vitest";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  markBankPaid,
  revertBankPaid,
  markPaid,
  markPending,
  setCashPaidRuts,
  pendingCashOf,
  removeWorkerFromPayroll,
  removeCycleFromPayroll,
  addCyclesToPayroll,
  recalculatePayrollItems,
  recalcPayrollAggregates,
} from "../../src/services/payrollsService";
import { ANA, BETO, CARO, CICLO, seedEscenarioNomina, get } from "./helpers/seed";
import { workdaysService } from "../../src/services";
import { workdayDocId } from "../../src/utils/cosechaCombos";
import { LABOR } from "./helpers/seed";

const wdId = (rut, date) => workdayDocId(CICLO, LABOR, rut, date, "1_1");

// Nómina mínima con una persona de banco y una de efectivo.
async function nominaConDosBolsas() {
  await seedEscenarioNomina();
  const items = [
    {
      rut: ANA.id,
      name: ANA.name,
      bankCode: "012",
      amount: 100000,
      advance: 0,
      workdayIds: [wdId(ANA.id, "2026-03-02"), wdId(ANA.id, "2026-03-03")],
      advanceIds: [],
    },
    {
      rut: BETO.id,
      name: BETO.name,
      bankCode: "EFE",
      amount: 50000,
      advance: 0,
      workdayIds: [wdId(BETO.id, "2026-03-02")],
      advanceIds: [],
    },
  ];
  const agg = recalcPayrollAggregates(items);
  const p = await payrollsService.create({
    name: "Dos bolsas",
    status: "pending",
    cycleIds: [CICLO],
    ...agg,
  });
  await tagWorkdaysWithPayroll(agg.workdayIds, p.id);
  return p.id;
}

// `paidAt` es un Timestamp de Firestore, así que se compara por milisegundos:
// dos Timestamp con el mismo instante son objetos distintos.
const paidDe = async (rut, date) => {
  const wd = await get("workdays", wdId(rut, date));
  const t = wd?.paidAt;
  return t ? t.toMillis() : null;
};

describe("pago en dos tiempos", () => {
  it("marcar solo transferencias sella los workdays de banco y ninguno de efectivo", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);

    const p = await get("payrolls", id);
    expect(p.bankPaidAt).toBeTruthy();
    // La nómina NO pasa a pagada: no está pagada entera.
    expect(p.status).toBe("pending");

    expect(await paidDe(ANA.id, "2026-03-02")).toBeTruthy();
    expect(await paidDe(ANA.id, "2026-03-03")).toBeTruthy();
    expect(await paidDe(BETO.id, "2026-03-02")).toBe(null);
  });

  it("la deuda de efectivo aparece recién con el flag puesto", async () => {
    const id = await nominaConDosBolsas();
    // Recién generada: hay efectivo, pero no es deuda vencida.
    expect(pendingCashOf(await get("payrolls", id))).toBe(0);

    await markBankPaid(id);
    expect(pendingCashOf(await get("payrolls", id))).toBe(50000);
  });

  it("marcar a una persona suelta baja la deuda su monto exacto", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    await setCashPaidRuts(id, [BETO.id]);

    const p = await get("payrolls", id);
    expect(pendingCashOf(p)).toBe(0);
    expect(p.cashPaidRuts).toEqual([BETO.id]);
    // Pero NO se le estampa paidAt: eso lo hace markPaid al final.
    expect(await paidDe(BETO.id, "2026-03-02")).toBe(null);
  });

  it("pagar entera sella el efectivo y NO pisa la fecha real del banco", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    const fechaBanco = await paidDe(ANA.id, "2026-03-02");

    const p = await get("payrolls", id);
    await markPaid(id, p.workdayIds);

    const final = await get("payrolls", id);
    expect(final.status).toBe("paid");
    // El efectivo quedó sellado ahora.
    expect(await paidDe(BETO.id, "2026-03-02")).toBeTruthy();
    // Y el banco conserva la fecha de cuando salió la transferencia.
    expect(await paidDe(ANA.id, "2026-03-02")).toBe(fechaBanco);
    // bankPaidAt se conserva como registro histórico.
    expect(final.bankPaidAt).toBeTruthy();
    expect(pendingCashOf(final)).toBe(0);
  });

  it("revertir las transferencias vuelve al estado inicial", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    await revertBankPaid(id);

    const p = await get("payrolls", id);
    expect(p.bankPaidAt).toBe(null);
    expect(p.status).toBe("pending");
    expect(await paidDe(ANA.id, "2026-03-02")).toBe(null);
    expect(pendingCashOf(p)).toBe(0);
  });

  it("volver a pendiente limpia el flag y los cobros sueltos", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    await setCashPaidRuts(id, [BETO.id]);
    const p = await get("payrolls", id);
    await markPaid(id, p.workdayIds);
    await markPending(id, p.workdayIds);

    const final = await get("payrolls", id);
    expect(final.status).toBe("pending");
    expect(final.bankPaidAt).toBe(null);
    expect(final.cashPaidRuts).toEqual([]);
    // Solo los workdays de esta nómina: el escenario siembra uno más, de un
    // trabajador que nunca entró, y ese no tiene el campo.
    for (const wdKey of final.workdayIds) {
      expect((await get("workdays", wdKey)).paidAt).toBe(null);
    }
  });

  it("no se puede marcar solo transferencias si ya está pagada entera", async () => {
    const id = await nominaConDosBolsas();
    const p = await get("payrolls", id);
    await markPaid(id, p.workdayIds);
    await expect(markBankPaid(id)).rejects.toThrow(/pagada/i);
  });
});

describe("guards de edición con transferencias emitidas", () => {
  it("no deja sacar a un trabajador después de transferir", async () => {
    // Sacarlo liberaría sus días y le restauraría anticipos a alguien que ya
    // tiene la plata en la cuenta.
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    await expect(removeWorkerFromPayroll(id, ANA.id)).rejects.toThrow(/transferencias/i);
  });

  it("sí deja sacarlo mientras no se transfirió", async () => {
    const id = await nominaConDosBolsas();
    await removeWorkerFromPayroll(id, ANA.id);

    const p = await get("payrolls", id);
    expect(p.items.map((i) => i.rut)).toEqual([BETO.id]);
    expect(p.total).toBe(50000);
    // Y sus días volvieron al pool.
    const libres = await workdaysService.list({ wheres: [["workerRut", "==", ANA.id]] });
    for (const wd of libres) expect(wd.payrollId).toBe(null);
  });

  it("los totales se recalculan solos al sacar a alguien", async () => {
    const id = await nominaConDosBolsas();
    await removeWorkerFromPayroll(id, ANA.id);
    const p = await get("payrolls", id);
    expect(p.bankTotal + p.cashTotal).toBe(p.total);
    expect(p.workerCount).toBe(1);
    expect(p.bankCount).toBe(0);
    expect(p.cashCount).toBe(1);
  });

  // Las otras tres puertas de edición de una nómina. Las cuatro pasan por
  // `assertEditable`, pero cada una la llama por su cuenta: si alguien agrega
  // un camino nuevo y se olvida de la línea, solo lo caza un test por camino.
  it("no deja agregar ciclos después de transferir", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    const p = await get("payrolls", id);
    await expect(
      addCyclesToPayroll(id, {
        items: p.items,
        cycleDetailsToAdd: [{ id: "ciclo-2", label: "Faena Uno/Sub Uno/ciclo-2" }],
      }),
    ).rejects.toThrow(/transferencias/i);
  });

  it("no deja recalcular después de transferir", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    const p = await get("payrolls", id);
    // El mensaje nombra la acción: `assertEditable` recibe el verbo.
    await expect(recalculatePayrollItems(id, { items: p.items })).rejects.toThrow(
      /recalcular/i,
    );
  });

  it("no deja sacar un ciclo después de transferir", async () => {
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    await expect(removeCycleFromPayroll(id, CICLO)).rejects.toThrow(/transferencias/i);
  });

  it("nada de eso cambió la nómina", async () => {
    // Un guard que tira pero deja escrito algo a medias sería peor que no
    // tenerlo: lo que importa es que el documento quede intacto.
    const id = await nominaConDosBolsas();
    await markBankPaid(id);
    const antes = await get("payrolls", id);

    for (const intento of [
      () => addCyclesToPayroll(id, { items: antes.items, cycleDetailsToAdd: [{ id: "ciclo-2", label: "x" }] }),
      () => recalculatePayrollItems(id, { items: antes.items }),
      () => removeCycleFromPayroll(id, CICLO),
      () => removeWorkerFromPayroll(id, ANA.id),
    ]) {
      await expect(intento()).rejects.toThrow();
    }

    const despues = await get("payrolls", id);
    expect(despues.total).toBe(antes.total);
    expect(despues.items).toHaveLength(antes.items.length);
    expect(despues.cycleIds).toEqual(antes.cycleIds);
  });
});

describe("guards de edición con la nómina pagada entera", () => {
  // La otra rama de `assertEditable`: `status === "paid"`, con su propio
  // mensaje. Sin esto, un cambio que rompa solo esta rama pasaría.
  it("pagada tampoco se agrega, ni se recalcula, ni se saca a nadie", async () => {
    const id = await nominaConDosBolsas();
    const p = await get("payrolls", id);
    await markPaid(id, p.workdayIds);

    await expect(
      addCyclesToPayroll(id, { items: p.items, cycleDetailsToAdd: [{ id: "ciclo-2", label: "x" }] }),
    ).rejects.toThrow(/pagada/i);
    await expect(recalculatePayrollItems(id, { items: p.items })).rejects.toThrow(/pagada/i);
    await expect(removeWorkerFromPayroll(id, ANA.id)).rejects.toThrow(/pagada/i);
  });
});

describe("las mismas operaciones mientras la nómina sigue pendiente", () => {
  // Control positivo. Sin esto, un guard que rechazara siempre —por el motivo
  // equivocado— dejaría los tests de arriba en verde igual.
  it("agregar un ciclo suma sus ids y sus totales", async () => {
    const id = await nominaConDosBolsas();
    const p = await get("payrolls", id);
    const nuevos = [
      ...p.items,
      {
        rut: CARO.id,
        name: CARO.name,
        bankCode: "",
        amount: 30000,
        advance: 0,
        workdayIds: [wdId(CARO.id, "2026-03-02")],
        advanceIds: [],
      },
    ];
    await addCyclesToPayroll(id, {
      items: nuevos,
      cycleDetailsToAdd: [{ id: "ciclo-2", label: "Faena Uno/Sub Uno/ciclo-2" }],
    });

    const final = await get("payrolls", id);
    expect(final.cycleIds).toContain("ciclo-2");
    expect(final.total).toBe(180000);
    expect(final.workerCount).toBe(3);
  });

  it("recalcular persiste los totales nuevos sin tocar los ciclos", async () => {
    const id = await nominaConDosBolsas();
    const p = await get("payrolls", id);
    const corregidos = p.items.map((it) =>
      it.rut === ANA.id ? { ...it, amount: 120000 } : it,
    );
    await recalculatePayrollItems(id, { items: corregidos });

    const final = await get("payrolls", id);
    expect(final.total).toBe(170000);
    expect(final.bankTotal).toBe(120000);
    expect(final.cycleIds).toEqual(p.cycleIds);
  });
});
