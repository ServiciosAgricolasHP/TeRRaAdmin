// Tests de `storage.rules`: los adjuntos de Cheques y pagos los sube, ve y
// borra una sesión con la marca de acceso (`appAccess`, que pone la función
// `syncAccessClaim`); los respaldos y lo demás quedan cerrados desde el
// navegador.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getMetadata, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "demo-terra-rules";
const PATH = "commitments/c1/a1-comprobante.jpg";

// Las marcas de la sesión de cada cuenta de prueba: con acceso, suspendida (la
// marca en `false`) y una cuenta sin perfil, que nunca la recibió.
const CLAIMS = {
  sup1: { appAccess: true },
  offUser: { appAccess: false },
  stranger: {},
};

let env;

const storageOf = (uid) => (uid ? env.authenticatedContext(uid, CLAIMS[uid]) : env.unauthenticatedContext()).storage();
const bytes = (n) => new Uint8Array(n).fill(1);
const upload = (uid, path, { size = 1000, contentType = "image/jpeg" } = {}) =>
  uploadBytes(ref(storageOf(uid), path), bytes(size), { contentType });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "commitments/c1/a0-factura.pdf"), bytes(500), { contentType: "application/pdf" });
    await uploadBytes(ref(ctx.storage(), "backups/b1.json"), bytes(500), { contentType: "application/json" });
  });
});

describe("adjuntos de Cheques y pagos", () => {
  it("una sesión con acceso sube una imagen o un PDF, los ve y los borra", async () => {
    await assertSucceeds(upload("sup1", PATH));
    await assertSucceeds(upload("sup1", "commitments/c1/a2-cartola.pdf", { contentType: "application/pdf" }));
    await assertSucceeds(getMetadata(ref(storageOf("sup1"), "commitments/c1/a0-factura.pdf")));
    await assertSucceeds(deleteObject(ref(storageOf("sup1"), "commitments/c1/a0-factura.pdf")));
  });

  it("no acepta Word, Excel ni otros tipos", async () => {
    await assertFails(upload("sup1", "commitments/c1/a3-carta.docx", { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    await assertFails(upload("sup1", "commitments/c1/a4-planilla.xlsx", { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    await assertFails(upload("sup1", "commitments/c1/a5-nota.txt", { contentType: "text/plain" }));
  });

  it("no acepta un archivo de más de 10 MB", async () => {
    await assertSucceeds(upload("sup1", "commitments/c1/a6-justo.jpg", { size: 10 * 1024 * 1024 }));
    await assertFails(upload("sup1", "commitments/c1/a7-grande.jpg", { size: 10 * 1024 * 1024 + 1 }));
  });

  it("no pisa un adjunto que ya existe", async () => {
    await assertFails(upload("sup1", "commitments/c1/a0-factura.pdf", { contentType: "application/pdf" }));
  });

  it("una sesión sin la marca, suspendida o sin sesión no sube, no ve y no borra", async () => {
    for (const uid of ["stranger", "offUser", null]) {
      await assertFails(upload(uid, PATH));
      await assertFails(getMetadata(ref(storageOf(uid), "commitments/c1/a0-factura.pdf")));
      await assertFails(deleteObject(ref(storageOf(uid), "commitments/c1/a0-factura.pdf")));
    }
  });
});

describe("lo demás del bucket", () => {
  it("los respaldos no se leen ni se escriben desde el navegador", async () => {
    await assertFails(getMetadata(ref(storageOf("sup1"), "backups/b1.json")));
    await assertFails(upload("sup1", "backups/b2.json", { contentType: "application/json" }));
  });

  it("una ruta fuera de los adjuntos queda cerrada", async () => {
    await assertFails(upload("sup1", "otros/foto.jpg"));
    await assertFails(upload("sup1", "commitments/foto.jpg"));
  });
});
