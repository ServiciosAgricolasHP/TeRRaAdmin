import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { phoneContactsService, syncPhoneContacts } from "../../src/services/phoneContactsService";

// La agenda se lee entera una vez y después se pone al día con lo que cambió
// (`updatedAt`) y con un conteo de los contactos. Lo que hace "otro equipo" se
// escribe directo en Firestore, sin pasar por la caché.
const write = (id, data) =>
  setDoc(doc(db, "phoneContacts", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

async function seedThree() {
  await write("p1", { name: "Carla Soto", phones: [{ number: "+56911111111", label: "Móvil" }] });
  await write("p2", { name: "Ana Pérez", phones: [{ number: "+56922222222", label: "Móvil" }] });
  await write("p3", { name: "Beto Ruiz", phones: [{ number: "+56933333333", label: "Móvil" }] });
}

const names = (list) => list.map((c) => c.name).sort();

describe("la agenda en el navegador", () => {
  it("la primera vez la lee entera y enseguida sale de la copia", async () => {
    await seedThree();
    const first = await syncPhoneContacts();
    expect(first.reads).toBe(3);
    expect(names(first.data)).toEqual(["Ana Pérez", "Beto Ruiz", "Carla Soto"]);

    const again = await syncPhoneContacts();
    expect(again.reads).toBe(0);
    expect(again.data).toBe(first.data);
  });

  it("pone al día lo que otro equipo cambió y agregó", async () => {
    await seedThree();
    await syncPhoneContacts();
    await write("p2", { name: "Ana Pérez Lagos" });
    await write("p4", { name: "Dina Mora", phones: [{ number: "+56944444444", label: "Móvil" }] });

    const { data } = await syncPhoneContacts({ fresh: true });
    expect(names(data)).toEqual(["Ana Pérez Lagos", "Beto Ruiz", "Carla Soto", "Dina Mora"]);
  });

  it("un contacto eliminado en otro equipo sale con la siguiente puesta al día", async () => {
    await seedThree();
    await syncPhoneContacts();
    await deleteDoc(doc(db, "phoneContacts", "p3"));

    const { data } = await syncPhoneContacts({ fresh: true });
    expect(names(data)).toEqual(["Ana Pérez", "Carla Soto"]);
  });

  it("eliminar en este equipo lo saca de la copia sin volver a leerla entera", async () => {
    await seedThree();
    await syncPhoneContacts();
    await phoneContactsService.remove("p3", { additive: true });

    // La puesta al día trae los dos que se escribieron en los últimos 5
    // minutos (el margen de la marca) y cuenta: 3 lecturas, sin la carga
    // completa.
    const { data, reads } = await syncPhoneContacts({ fresh: true });
    expect(names(data)).toEqual(["Ana Pérez", "Carla Soto"]);
    expect(reads).toBe(3);
  });

  it("borrar la caché la vuelve a leer entera", async () => {
    await seedThree();
    await syncPhoneContacts();
    // Como la consola de Firebase, que no marca la hora.
    await setDoc(doc(db, "phoneContacts", "p2"), { name: "Ana Pérez Consola" }, { merge: true });

    phoneContactsService.invalidate();
    const full = await syncPhoneContacts();
    expect(full.reads).toBe(3);
    expect(names(full.data)).toContain("Ana Pérez Consola");
  });
});
