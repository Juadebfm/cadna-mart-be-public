import { BadRequestException } from '@nestjs/common';
import { parseProductCsv, PRODUCT_IMPORT_TEMPLATE } from './product-bulk-csv';

describe('product CSV import parser', () => {
  it('parses the downloadable template, including quoted commas and grouped variant rows', () => {
    const rows = parseProductCsv(Buffer.from(PRODUCT_IMPORT_TEMPLATE));

    expect(rows).toHaveLength(3);
    expect(rows[0].values.name).toBe('Cotton T-Shirt');
    expect(rows[0].values.product_key).toBe(rows[1].values.product_key);
    expect(rows[1].values.variant_sku).toBe('SHIRT-1-M-BL');
    expect(rows[2].values.stock_qty).toBe('12');
  });

  it('preserves commas and newlines inside quoted values', () => {
    const rows = parseProductCsv(
      Buffer.from(
        'product_key,name,price_amount,description\r\np1,"Cup, blue",10,"First line\nSecond line"',
      ),
    );
    expect(rows[0].values.name).toBe('Cup, blue');
    expect(rows[0].values.description).toBe('First line\nSecond line');
  });

  it('rejects a missing required column and unclosed quoted values', () => {
    expect(() => parseProductCsv(Buffer.from('name,price_amount\np1,10'))).toThrow(
      BadRequestException,
    );
    expect(() => parseProductCsv(Buffer.from('product_key,name,price_amount\np1,"Cup,10'))).toThrow(
      BadRequestException,
    );
  });
});
