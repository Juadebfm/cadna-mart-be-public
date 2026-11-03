import { BadRequestException } from '@nestjs/common';

export type CsvRecord = { rowNumber: number; values: Record<string, string> };

export const BULK_PRODUCT_HEADERS = [
  'product_key',
  'name',
  'brand',
  'sku',
  'category_id',
  'subcategory_id',
  'price_amount',
  'compare_at_price_amount',
  'description',
  'thumbnail_url',
  'additional_image_urls',
  'stock_qty',
  'delivery_method',
  'shipping_weight_grams',
  'logistics_category_id',
  'package_length_cm',
  'package_width_cm',
  'package_height_cm',
  'option1_name',
  'option1_value',
  'option2_name',
  'option2_value',
  'variant_sku',
  'variant_price_adjustment_amount',
  'variant_stock_qty',
  'variant_image_urls',
] as const;

export function parseProductCsv(buffer: Buffer): CsvRecord[] {
  let source = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!source.trim()) throw new BadRequestException('The CSV file is empty');
  if (source.includes('\0')) throw new BadRequestException('The CSV file contains invalid text');

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      if (cell.length) throw new BadRequestException('Unexpected quote in CSV file');
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new BadRequestException('A quoted CSV value is not closed');
  row.push(cell);
  if (row.some((value) => value.trim())) matrix.push(row);
  source = '';

  if (matrix.length < 2) throw new BadRequestException('Add at least one product row');
  const headers = matrix[0].map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) {
    throw new BadRequestException('The CSV has duplicate column names');
  }
  for (const required of ['product_key', 'name', 'price_amount']) {
    if (!headers.includes(required)) {
      throw new BadRequestException(`The CSV is missing the required column: ${required}`);
    }
  }
  const extraHeaders = headers.filter(
    (header) => !BULK_PRODUCT_HEADERS.includes(header as (typeof BULK_PRODUCT_HEADERS)[number]),
  );
  if (extraHeaders.length) {
    throw new BadRequestException(`Unknown CSV column: ${extraHeaders[0]}`);
  }

  return matrix.slice(1).map((cells, index) => {
    if (
      cells.length > headers.length &&
      cells.slice(headers.length).some((value) => value.trim())
    ) {
      throw new BadRequestException(`Row ${index + 2} has more values than the header`);
    }
    return {
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, column) => [header, (cells[column] ?? '').trim()]),
      ),
    };
  });
}

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
const exampleRows = [
  BULK_PRODUCT_HEADERS as unknown as string[],
  [
    'shirt-1',
    'Cotton T-Shirt',
    'Cadna',
    'SHIRT-1',
    '',
    '',
    '25000',
    '30000',
    'Soft cotton shirt',
    'https://example.com/shirt.jpg',
    'https://example.com/front.jpg|https://example.com/back.jpg',
    '',
    'seller_owned_courier',
    '250',
    '',
    '20',
    '15',
    '5',
    'Size',
    'S',
    'Colour',
    'Blue',
    'SHIRT-1-S-BL',
    '0',
    '5',
    'https://example.com/blue-small.jpg',
  ],
  [
    'shirt-1',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Size',
    'M',
    'Colour',
    'Blue',
    'SHIRT-1-M-BL',
    '0',
    '3',
    'https://example.com/blue-medium.jpg',
  ],
  [
    'mug-1',
    'Ceramic Mug',
    'Home',
    'MUG-1',
    '',
    '',
    '8000',
    '',
    '',
    '',
    '',
    '12',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
];

export const PRODUCT_IMPORT_TEMPLATE =
  exampleRows.map((values) => values.map(csvEscape).join(',')).join('\r\n') + '\r\n';
