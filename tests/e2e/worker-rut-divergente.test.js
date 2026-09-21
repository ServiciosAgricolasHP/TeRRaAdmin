import { describe, it, expect } from "vitest";
import { workerKeys, deleteWorkerSafe } from "../../src/services/workersService";
import { workdaysService, workersService } from "../../src/services";
import { loadWorkerSummaryData } from "../../src/components/WorkerSummaryModal";
import { seedCycle, seedWorkday, set, get, CICLO } from "./helpers/seed";

// Caso real: un extranjero que entró con cédula provisoria y después consiguió
// su rut definitivo. El doc id queda congelado con el rut viejo (Firestore no
// renombra documentos) y el campo `rut` pasa a tener el nuevo. Sus workdays
// quedan repartidos entre los dos valores según cuándo se escribieron.
const VIEJO = "12345678-5"; // doc id = rut de creación
const NUEVO = "11111111-1"; // rut vigente

async function seedDivergente() {
  await seedCycle();
  await set("worker", VIEJO, {
    rut: NUEVO,
    name: "Boris Extranjero",
    groupLeader: ["GRUPO A"],
    bankDetails: [NUEVO, "12345678", 3, "012"],
  });
  // Días escritos ANTES del cambio: el roster tenía el rut viejo.
  const antes = await seedWorkday({ rut: VIEJO, date: "2026-03-02", amount: 40000 });
  // Días escritos DESPUÉS: el roster ya tenía el nuevo.
  const despues = await seedWorkday({ rut: NUEVO, date: "2026-03-03", amount: 60000 });
  return { antes, despues };
}

describe("trabajador con rut distinto del doc id", () => {
  it("una sola consulta encuentra los dos tramos", async () => {
    const { antes, despues } = await seedDivergente();
    const w = await get("worker", VIEJO);
    const claves = workerKeys(w);
    expect(claves).toEqual([VIEJO, NUEVO]);

    const wds = await workdaysService.list({ wheres: [["workerRut", "in", claves]] });
    expect(wds.map((x) => x.id).sort()).toEqual([antes, despues].sort());
  });

  it("no arrastra días de otra persona", async () => {
    await seedDivergente();
    await set("worker", "99999999-9", { rut: "99999999-9", name: "Otra" });
    const ajeno = await seedWorkday({ rut: "99999999-9", date: "2026-03-02", amount: 1000 });

    const claves = workerKeys(await get("worker", VIEJO));
    const wds = await workdaysService.list({ wheres: [["workerRut", "in", claves]] });
    expect(wds.map((x) => x.id)).not.toContain(ajeno);
  });

  it("el resumen del trabajador suma los dos tramos", async () => {
    await seedDivergente();
    const w = await get("worker", VIEJO);
    const { data } = await loadWorkerSummaryData(w, {});

    const total = data.reduce((s, d) => s + (d.totals?.amount || 0), 0);
    // 40.000 escritos con el rut viejo + 60.000 con el nuevo.
    expect(total).toBe(100000);
  });

  it("un trabajador normal sigue funcionando igual", async () => {
    await seedCycle();
    await set("worker", "11111111-1", {
      rut: "11111111-1",
      name: "Ana Normal",
      groupLeader: ["GRUPO A"],
      bankDetails: ["11111111-1", "1234", 3, "012"],
    });
    await seedWorkday({ rut: "11111111-1", date: "2026-03-02", amount: 25000 });

    const w = await get("worker", "11111111-1");
    expect(workerKeys(w)).toEqual(["11111111-1"]);
    const { data } = await loadWorkerSummaryData(w, {});
    expect(data.reduce((s, d) => s + (d.totals?.amount || 0), 0)).toBe(25000);
  });
});

describe("deleteWorkerSafe", () => {
  it("no deja borrar a alguien con producción bajo su rut VIEJO", async () => {
    await seedCycle();
    await set("worker", VIEJO, { rut: NUEVO, name: "Boris" });
    await seedWorkday({ rut: VIEJO, date: "2026-03-02", amount: 1000 });

    const w = await get("worker", VIEJO);
    await expect(deleteWorkerSafe(w)).rejects.toThrow(/días asociados/i);
    expect(await get("worker", VIEJO)).not.toBe(null);
  });

  it("tampoco con producción bajo su rut NUEVO", async () => {
    await seedCycle();
    await set("worker", VIEJO, { rut: NUEVO, name: "Boris" });
    await seedWorkday({ rut: NUEVO, date: "2026-03-03", amount: 1000 });

    await expect(deleteWorkerSafe(await get("worker", VIEJO))).rejects.toThrow(/días asociados/i);
  });

  it("sí deja borrar a alguien sin producción", async () => {
    await seedCycle();
    await set("worker", "22222222-2", { rut: "22222222-2", name: "Nadie" });
    await deleteWorkerSafe(await get("worker", "22222222-2"));
    expect(await get("worker", "22222222-2")).toBe(null);
  });

  it("cubre también el historial de ruts", async () => {
    await seedCycle();
    await set("worker", "11111111-1", {
      rut: "12345670-K",
      rutHistory: ["12345678-5"],
      name: "Cambió dos veces",
    });
    // Producción escrita con el rut del medio, el que quedó en el historial.
    await seedWorkday({ rut: "12345678-5", date: "2026-03-02", amount: 1000 });

    await expect(deleteWorkerSafe(await get("worker", "11111111-1"))).rejects.toThrow(
      /días asociados/i,
    );
  });
});

describe("workersService contra el emulador", () => {
  it("el doc id se congela aunque cambie el rut", async () => {
    await set("worker", VIEJO, { rut: VIEJO, name: "Boris" });
    await workersService.update(VIEJO, { rut: NUEVO, rutHistory: [VIEJO] });

    const w = await get("worker", VIEJO);
    expect(w.id).toBe(VIEJO); // el id NO cambia
    expect(w.rut).toBe(NUEVO);
    expect(await get("worker", NUEVO)).toBe(null); // no se creó otro documento
  });
});
