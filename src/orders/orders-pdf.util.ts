import { Order } from './schemas/order.schema';

function pdfText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(value: string, width = 88): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const output: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > width) {
      output.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) output.push(current);
  return output.length ? output : [''];
}

export function buildOrdersPdf(orders: Order[], generatedAt = new Date()): Buffer {
  const lines: string[] = [
    'CADNA MART - ORDER HISTORY',
    `Generated: ${generatedAt.toISOString()}`,
    `Orders: ${orders.length}`,
    '',
  ];

  for (const order of orders) {
    const total = order.pricing?.total;
    lines.push(`${order.orderRef} | ${order.status} | ${order.createdAt?.toISOString?.() ?? ''}`);
    lines.push(`Total: ${total?.currency ?? 'NGN'} ${total?.amount ?? ''}`);
    for (const item of order.items ?? []) {
      lines.push(`  ${item.quantity} x ${item.name}`);
    }
    lines.push('');
  }

  const wrappedLines = lines.flatMap((line) => wrapLine(line));
  const pages: string[][] = [];
  for (let offset = 0; offset < wrappedLines.length; offset += 48) {
    pages.push(wrappedLines.slice(offset, offset + 48));
  }
  if (pages.length === 0) pages.push(['No orders found.']);

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const pageRefs: string[] = [];

  pages.forEach((pageLines, index) => {
    const pageObjectId = 4 + index * 2;
    const streamObjectId = pageObjectId + 1;
    const commands = [
      'BT',
      '/F1 10 Tf',
      '48 760 Td',
      '14 TL',
      ...pageLines.flatMap((line) => [`(${pdfText(line)}) Tj`, 'T*']),
      'ET',
    ].join('\n');
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamObjectId} 0 R >>`;
    objects[streamObjectId] =
      `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`;
    pageRefs.push(`${pageObjectId} 0 R`);
  });
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
