import { describe, it, expect } from "vitest";
import { doc, getDocs, collection, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { ensureGroupLeaders, listGroupLeaders } from "../../src/services/groupLeadersService";

// Un grupo nace en la lista de líderes: los que faltan se crean habilitados,
// sin repetir los que ya están y sin tocar uno deshabilitado.
const leaderNames = async () => (await getDocs(collection(db, "groupLeader"))).docs.map((d) => d.data()).map((d) => `${d.name}:${d.habilitado}`).sort();

describe("dejar líderes en la lista", () => {
  it("crea habilitados los que faltan, en mayúsculas, y no toca los que están", async () => {
    await setDoc(doc(db, "groupLeader", "CHILENOS"), { name: "CHILENOS", habilitado: true });
    await setDoc(doc(db, "groupLeader", "viejo"), { name: "Viejo", habilitado: false });

    const result = await ensureGroupLeaders(["chilenos", " norte ", "NORTE", "viejo", ""]);

    expect(result).toEqual({ created: ["NORTE"], disabled: ["VIEJO"] });
    expect(await leaderNames()).toEqual(["CHILENOS:true", "NORTE:true", "Viejo:false"]);
    // La lista del navegador ya lo trae.
    expect((await listGroupLeaders()).map((d) => d.name).sort()).toEqual(["CHILENOS", "NORTE", "Viejo"]);
  });

  it("sin nombres no lee ni escribe", async () => {
    expect(await ensureGroupLeaders([null, ""])).toEqual({ created: [], disabled: [] });
    expect(await leaderNames()).toEqual([]);
  });
});
