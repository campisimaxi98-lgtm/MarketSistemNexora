// Generador mínimo de PDF (texto, sin dependencias) para tickets de 80 mm.

function escapeLatin1(s) {
  return String(s).replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7E]/g, (m) => {
    const c = m.charCodeAt(0);
    if (c >= 0x80 && c <= 0xFF) return m; // latin-1 permitido
    return '';
  });
}

function generarTicketPDF({ lineas, ancho = 240 }) {
  let stream = '';
  let y = 36;
  for (const l of lineas) {
    const size = l.size || 9;
    const fuente = l.bold ? '/F2' : '/F1';
    const texto = escapeLatin1(l.text);
    if (l.center) {
      const w = texto.length * size * 0.5;
      const x = Math.max(6, Math.round((ancho - w) / 2));
      stream += `BT ${fuente} ${size} Tf ${x} ${y} Td (${texto}) Tj ET\n`;
    } else {
      stream += `BT ${fuente} ${size} Tf 10 ${y} Td (${texto}) Tj ET\n`;
    }
    y += size === 14 ? 19 : size === 11 ? 15 : 13;
    if (y > 800) break;
  }
  const alto = Math.min(842, y + 30);

  const partes = [];
  let offsets = [];
  const push = (t) => { const b = Buffer.from(t + '\n', 'latin1'); offsets.push(partes.join('').length); partes.push(b); return b.length; };
  push('%PDF-1.4');
  push('1 0 obj');
  push('<< /Type /Catalog /Pages 2 0 R >>');
  push('endobj');
  push('2 0 obj');
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  push('endobj');
  push('3 0 obj');
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`);
  push('endobj');
  push('4 0 obj');
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  push('endobj');
  push('5 0 obj');
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  push('endobj');
  push('6 0 obj');
  push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>`);
  push('stream');
  push(stream);
  push('endstream');
  push('endobj');

  const xrefOffset = partes.join('').length;
  let xref = '';
  xref += `xref\n0 7\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 0; i < 6; i++) xref += String(offsets[i + 1]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bufs = [...partes, Buffer.from(xref, 'latin1')];
  return Buffer.concat(bufs);
}

module.exports = { generarTicketPDF };