import { ProductBulkImportService } from './product-bulk-import.service';
import { BULK_PRODUCT_HEADERS, parseProductCsv } from './product-bulk-csv';

const csvRow = (values: Record<string, string>) =>
  BULK_PRODUCT_HEADERS.map((header) => `"${(values[header] ?? '').replace(/"/g, '""')}"`).join(',');

describe('ProductBulkImportService', () => {
  const prisma = {
    seller: { findFirst: jest.fn() },
    category: { findMany: jest.fn() },
    productImportBatch: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: ProductBulkImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductBulkImportService(prisma as any);
    prisma.seller.findFirst.mockResolvedValue({ id: 'seller-id' });
    prisma.category.findMany.mockResolvedValue([]);
    prisma.productImportBatch.deleteMany.mockResolvedValue({ count: 0 });
    prisma.productImportBatch.create.mockImplementation(async ({ data }) => data);
  });

  it('previews simple and variant products as private Drafts', async () => {
    const header = BULK_PRODUCT_HEADERS.join(',');
    const shirt = {
      product_key: 'shirt',
      name: 'Shirt',
      price_amount: '100',
      option1_name: 'Size',
      option1_value: 'S',
      variant_sku: 'SHIRT-S',
      variant_stock_qty: '2',
    };
    const shirtM = {
      product_key: 'shirt',
      option1_name: 'Size',
      option1_value: 'M',
      variant_sku: 'SHIRT-M',
      variant_stock_qty: '3',
    };
    const mug = { product_key: 'mug', name: 'Mug', price_amount: '20', stock_qty: '4' };
    const file = Buffer.from([header, csvRow(shirt), csvRow(shirtM), csvRow(mug)].join('\n'));

    const result = (await service.preview(file, 'owner-id')) as any;
    const staged = prisma.productImportBatch.create.mock.calls[0][0].data.products;

    expect(result).toMatchObject({ totalProducts: 2, validProducts: 2, errorCount: 0 });
    expect(staged[0].data).toMatchObject({
      sellerId: 'seller-id',
      publicationStatus: 'draft',
      isActive: false,
      stockQty: 5,
    });
    expect(staged[0].data.variants).toHaveLength(2);
    expect(staged[1].data).toMatchObject({ name: 'Mug', stockQty: 4, publicationStatus: 'draft' });
  });

  it('serves a valid CSV template with the same headers its parser accepts', () => {
    const serviceTemplate = service.template();
    const rows = parseProductCsv(Buffer.from(serviceTemplate));
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0].values)).toEqual(BULK_PRODUCT_HEADERS);
  });

  it('records row errors and refuses to commit an invalid preview', async () => {
    const file = Buffer.from(
      `${BULK_PRODUCT_HEADERS.join(',')}\n${csvRow({ product_key: 'x', name: 'Broken', price_amount: '-1' })}`,
    );
    const result = (await service.preview(file, 'owner-id')) as any;
    const batch = prisma.productImportBatch.create.mock.calls[0][0].data;

    expect(result.errorCount).toBeGreaterThan(0);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: jest.fn(),
        productImportBatch: {
          findFirst: jest.fn().mockResolvedValue({ ...batch, id: 'batch-id' }),
        },
      }),
    );
    await expect(service.commit('batch-id', 'owner-id')).rejects.toThrow('Fix the CSV errors');
  });

  it('commits products atomically and returns the prior result on a retry', async () => {
    const row = { product_key: 'mug', name: 'Mug', price_amount: '20', stock_qty: '4' };
    await service.preview(
      Buffer.from(`${BULK_PRODUCT_HEADERS.join(',')}\n${csvRow(row)}`),
      'owner-id',
    );
    const batch = prisma.productImportBatch.create.mock.calls[0][0].data;
    const tx = {
      $queryRaw: jest.fn(),
      productImportBatch: {
        findFirst: jest.fn().mockResolvedValue({ ...batch, id: 'batch-id', status: 'previewed' }),
        update: jest.fn(),
      },
      product: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.commit('batch-id', 'owner-id');
    expect(tx.product.create).toHaveBeenCalledTimes(1);
    expect(tx.productImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-id' },
        data: expect.objectContaining({ status: 'committed' }),
      }),
    );
    expect(result).toMatchObject({ status: 'committed', createdCount: 1 });

    tx.productImportBatch.findFirst.mockResolvedValue({
      id: 'batch-id',
      sellerId: 'seller-id',
      status: 'committed',
      result,
    });
    await expect(service.commit('batch-id', 'owner-id')).resolves.toEqual(result);
    expect(tx.product.create).toHaveBeenCalledTimes(1);
  });
});
