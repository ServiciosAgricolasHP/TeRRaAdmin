// Los archivos que los guiones de la ayuda adjuntan: la foto de un
// comprobante, la de un cheque y un PDF, inventados (el repo es público). Cada
// uno sale en la forma que recibe `setInputFiles` de Playwright.
import sharp from "sharp";

const FONT = "Arial, Helvetica, sans-serif";

const xml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const jpeg = async (name, svg) => ({ name, mimeType: "image/jpeg", buffer: await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer() });

// Un comprobante de transferencia, como la captura que manda el banco por
// WhatsApp: el título, el monto y las filas (`[etiqueta, valor]`).
export function receiptPhoto(name, { title = "Transferencia realizada", amount, rows }) {
  const W = 900;
  const H = 700 + rows.length * 104;
  const lines = rows
    .map(([label, value], i) => {
      const y = 600 + i * 104;
      return `<text x="110" y="${y}" font-size="30" fill="#6b7280">${xml(label)}</text>
        <text x="110" y="${y + 44}" font-size="36" fill="#111827" font-weight="bold">${xml(value)}</text>`;
    })
    .join("");
  return jpeg(
    name,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}">
      <rect width="${W}" height="${H}" fill="#e9ecef"/>
      <rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="28" fill="#ffffff"/>
      <circle cx="${W / 2}" cy="230" r="70" fill="#16a34a"/>
      <path d="M ${W / 2 - 32} 232 l 22 24 l 44 -52" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${W / 2}" y="370" font-size="40" text-anchor="middle" fill="#111827" font-weight="bold">${xml(title)}</text>
      <text x="${W / 2}" y="460" font-size="64" text-anchor="middle" fill="#111827" font-weight="bold">${xml(amount)}</text>
      <line x1="110" y1="520" x2="${W - 110}" y2="520" stroke="#e5e7eb" stroke-width="3"/>
      ${lines}
    </svg>`,
  );
}

// La foto de un cheque, sin banco: el número, el monto, a quién se paga, la
// suma en palabras, la fecha y la firma de quien lo entrega.
export function chequePhoto(name, { number, amount, payee, words, place, drawer }) {
  const W = 1400;
  const H = 640;
  return jpeg(
    name,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}">
      <rect width="${W}" height="${H}" fill="#cfd8cf"/>
      <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="10" fill="#eef5ea" stroke="#9fb59a" stroke-width="3"/>
      <text x="90" y="120" font-size="34" fill="#35533a" font-weight="bold">CHEQUE</text>
      <text x="${W - 90}" y="120" font-size="30" text-anchor="end" fill="#35533a">Nº ${xml(number)}</text>
      <rect x="${W - 470}" y="160" width="380" height="70" rx="6" fill="#ffffff" stroke="#9fb59a" stroke-width="2"/>
      <text x="${W - 110}" y="208" font-size="38" text-anchor="end" fill="#1f2937" font-weight="bold">${xml(amount)}</text>
      <text x="90" y="300" font-size="28" fill="#35533a">Páguese a la orden de</text>
      <text x="420" y="300" font-size="32" fill="#1f2937" font-style="italic">${xml(payee)}</text>
      <line x1="410" y1="312" x2="${W - 90}" y2="312" stroke="#9fb59a" stroke-width="2"/>
      <text x="90" y="380" font-size="28" fill="#35533a">la suma de</text>
      <text x="270" y="380" font-size="30" fill="#1f2937" font-style="italic">${xml(words)}</text>
      <line x1="260" y1="392" x2="${W - 90}" y2="392" stroke="#9fb59a" stroke-width="2"/>
      <text x="90" y="460" font-size="28" fill="#1f2937">${xml(place)}</text>
      <path d="M ${W - 480} 520 c 40 -60 70 30 110 -20 s 60 -40 90 10 s 70 -30 110 0" stroke="#1e3a8a" stroke-width="4" fill="none"/>
      <line x1="${W - 520}" y1="540" x2="${W - 90}" y2="540" stroke="#9fb59a" stroke-width="2"/>
      <text x="${W - 305}" y="575" font-size="24" text-anchor="middle" fill="#35533a">${xml(drawer)}</text>
    </svg>`,
  );
}

// Un PDF de una página con el título y las líneas en texto (Helvetica, en
// Latin-1: lleva tildes y eñes).
export function demoPdf(name, { title, lines }) {
  const pdfText = (text) => String(text).replace(/[\\()]/g, (c) => `\\${c}`);
  const body = [
    `BT /F1 18 Tf 60 770 Td (${pdfText(title)}) Tj ET`,
    ...lines.map((line, i) => `BT /F1 11 Tf 60 ${730 - i * 20} Td (${pdfText(line)}) Tj ET`),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(out, "latin1") };
}
