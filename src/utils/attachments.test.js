import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentKind,
  attachmentRejection,
  shrinkSize,
  attachmentFileName,
  attachmentPath,
  fileSizeLabel,
  inlineDisposition,
  transferFiles,
  viewerKind,
} from "./attachments";

const file = (name, type, size = 1000) => ({ name, type, size });

describe("qué se adjunta", () => {
  it("fotos, imágenes y PDF, por su tipo o, sin tipo, por la extensión", () => {
    expect(attachmentKind(file("foto.jpg", "image/jpeg"))).toBe("image");
    expect(attachmentKind(file("captura.png", "image/png"))).toBe("image");
    expect(attachmentKind(file("IMG_0001.HEIC", ""))).toBe("image");
    expect(attachmentKind(file("factura.pdf", "application/pdf"))).toBe("pdf");
    expect(attachmentKind(file("factura.PDF", ""))).toBe("pdf");
  });

  it("Word, Excel y lo demás no se adjuntan", () => {
    expect(attachmentKind(file("carta.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe(null);
    expect(attachmentKind(file("dibujo.svg", "image/svg+xml"))).toBe(null);
    expect(attachmentKind(file("nota.txt", "text/plain"))).toBe(null);
  });

  it("el motivo pide pasar Word y Excel a PDF", () => {
    expect(attachmentRejection(file("carta.docx", ""))).toMatch(/^carta\.docx: Word, Excel y similares no se adjuntan\. Guárdalo como PDF/);
    expect(attachmentRejection(file("cuadro.xlsx", "application/vnd.ms-excel"))).toMatch(/Guárdalo como PDF/);
    expect(attachmentRejection(file("nota.txt", "text/plain"))).toBe("nota.txt: solo se adjuntan fotos, imágenes y PDF.");
    expect(attachmentRejection(file("foto.jpg", "image/jpeg"))).toBe("");
  });

  it("un PDF de más de 10 MB no se adjunta; una foto se mide después de achicarla", () => {
    expect(attachmentRejection(file("escaneo.pdf", "application/pdf", ATTACHMENT_MAX_BYTES))).toBe("");
    expect(attachmentRejection(file("escaneo.pdf", "application/pdf", ATTACHMENT_MAX_BYTES + 1))).toBe(
      "escaneo.pdf: pesa 10,0 MB y el máximo es 10,0 MB.",
    );
    expect(attachmentRejection(file("foto.jpg", "image/jpeg", 30 * 1024 * 1024))).toBe("");
  });
});

describe("achicar una foto", () => {
  it("el lado más largo queda en 1.600 px y se mantiene la proporción", () => {
    expect(shrinkSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(shrinkSize(1080, 2400)).toEqual({ width: 720, height: 1600 });
  });

  it("una imagen más chica no se agranda", () => {
    expect(shrinkSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(shrinkSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe("nombre y ruta", () => {
  it("la extensión sigue al tipo final y la imagen pegada tiene nombre propio", () => {
    expect(attachmentFileName("IMG_2031.HEIC", "image/jpeg")).toBe("IMG_2031.jpg");
    expect(attachmentFileName("image.png", "image/jpeg")).toBe("imagen-pegada.jpg");
    expect(attachmentFileName("Factura 1190.pdf", "application/pdf")).toBe("Factura 1190.pdf");
  });

  it("saca lo que una ruta no acepta y corta los nombres largos", () => {
    expect(attachmentFileName("a/b\\c#d?.pdf", "application/pdf")).toBe("a b c d.pdf");
    expect(attachmentFileName(`${"x".repeat(120)}.pdf`, "application/pdf")).toBe(`${"x".repeat(80)}.pdf`);
    expect(attachmentFileName("", "image/jpeg")).toBe("imagen-pegada.jpg");
  });

  it("una carpeta por vencimiento, con el id delante del nombre", () => {
    expect(attachmentPath("chq_012_4512", "k3x9", "comprobante.jpg")).toBe("commitments/chq_012_4512/k3x9-comprobante.jpg");
  });

  it("el tamaño en KB o MB, con coma", () => {
    expect(fileSizeLabel(300)).toBe("1 KB");
    expect(fileSizeLabel(250 * 1024)).toBe("250 KB");
    expect(fileSizeLabel(1.25 * 1024 * 1024)).toBe("1,3 MB");
  });
});

describe("el visor", () => {
  it("muestra en la página con el nombre de la lista, codificado", () => {
    expect(inlineDisposition("Factura 1190.pdf")).toBe("inline; filename*=utf-8''Factura%201190.pdf");
    expect(inlineDisposition("Cheque Nº 4512 (copia)'s.jpg")).toBe("inline; filename*=utf-8''Cheque%20N%C2%BA%204512%20%28copia%29%27s.jpg");
    expect(inlineDisposition("")).toBe("inline; filename*=utf-8''archivo");
  });

  it("decide la vista por el tipo guardado", () => {
    expect(viewerKind("image/jpeg")).toBe("image");
    expect(viewerKind("IMAGE/PNG")).toBe("image");
    expect(viewerKind("application/pdf")).toBe("pdf");
    expect(viewerKind("text/plain")).toBe("other");
    expect(viewerKind(undefined)).toBe("other");
  });
});

describe("pegar y arrastrar", () => {
  const item = (f) => ({ kind: "file", getAsFile: () => f });

  it("toma los archivos de items, sin repetir los de files", () => {
    const img = file("image.png", "image/png");
    expect(transferFiles({ items: [item(img), { kind: "string", getAsFile: () => null }], files: [img] })).toEqual([img]);
  });

  it("sin items, usa files; sin nada, una lista vacía", () => {
    const pdf = file("factura.pdf", "application/pdf");
    expect(transferFiles({ files: [pdf] })).toEqual([pdf]);
    expect(transferFiles({ items: [{ kind: "string", getAsFile: () => null }] })).toEqual([]);
    expect(transferFiles(null)).toEqual([]);
  });
});
