import { describe, it, expect } from "vitest";
import { workdaysService } from "../../src/services";
import { set, get } from "./helpers/seed";

// La opción `before` de `upsert` deja pasar el documento que el llamador ya
// leyó, para no pagar la misma lectura dos veces. La usa la sincronización de
// Pesajes QR, que lee cada jornada para saber si ya está liquidada y acto
// seguido la escribe.
//
// Se fija que pasarlo no cambie nada del resultado.
const ID = "wd-before-1";

describe("upsert con `before` precargado", () => {
  it("crea igual que sin la opción, con createdAt", async () => {
    await workdaysService.upsert(ID, { qty: 10, amount: 5000 }, { before: null });
    const doc = await get("workdays", ID);
    expect(doc.qty).toBe(10);
    expect(doc.createdAt).toBeTruthy();
    expect(doc.updatedAt).toBeTruthy();
  });

  it("actualiza igual que sin la opción y no pisa createdAt", async () => {
    await set("workdays", ID, { qty: 1, amount: 100, createdAt: "sello-original" });
    const previo = await get("workdays", ID);

    await workdaysService.upsert(ID, { qty: 99, amount: 9900 }, { before: previo });

    const doc = await get("workdays", ID);
    expect(doc.qty).toBe(99);
    expect(doc.amount).toBe(9900);
    // Un update no vuelve a sellar la creación.
    expect(doc.createdAt).toBe("sello-original");
  });

  it("con `before: null` no vuelve a leer el documento", async () => {
    // Se observa pasando `null` sobre un doc que sí existe: si el servicio no
    // lee, toma el camino de creación y vuelve a sellar `createdAt`; si lee,
    // encuentra el doc y conserva el sello viejo.
    //
    // `null` = "lo leí y no existe"; `undefined` = "no me lo pasaron". Un
    // chequeo por verdad/falsedad (`knownBefore ? … : …`) no distingue los dos.
    const existente = "wd-before-null";
    await set("workdays", existente, { qty: 3, createdAt: "sello-viejo" });

    await workdaysService.upsert(existente, { qty: 4 }, { before: null });

    const doc = await get("workdays", existente);
    expect(doc.qty).toBe(4);
    expect(doc.createdAt).not.toBe("sello-viejo");
  });

  it("sin la opción sigue leyendo solo, como siempre", async () => {
    const otro = "wd-before-2";
    await set("workdays", otro, { qty: 7, createdAt: "sello-viejo" });
    await workdaysService.upsert(otro, { qty: 8 });
    const doc = await get("workdays", otro);
    expect(doc.qty).toBe(8);
    expect(doc.createdAt).toBe("sello-viejo");
  });

  it("el merge conserva los campos que no se tocaron", async () => {
    // `upsert` usa setDoc con merge: la sincronización escribe solo algunos
    // campos y el `payrollId` de una jornada ya liquidada se conserva.
    const otro = "wd-before-3";
    await set("workdays", otro, { qty: 5, payrollId: "nom-1", workerRut: "11111111-1" });
    const previo = await get("workdays", otro);
    await workdaysService.upsert(otro, { qty: 6 }, { before: previo });
    const doc = await get("workdays", otro);
    expect(doc.qty).toBe(6);
    expect(doc.payrollId).toBe("nom-1");
    expect(doc.workerRut).toBe("11111111-1");
  });
});
