import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService seller product lifecycle', () => {
  const repository = {
    update: jest.fn(),
    findByIdWithSeller: jest.fn(),
    prisma: {},
  };
  let service: ProductsService;
  const sellerUser = { userId: 'owner-id', accountType: 'seller' };
  const product = {
    _id: { toString: () => 'product-id' },
    seller: { _id: { toString: () => 'seller-id' }, owner: 'owner-id' },
    publicationStatus: 'draft',
    salesClosed: false,
    isDeactivated: false,
    isActive: false,
    moderationStatus: 'approved',
    variants: [],
    price: { amount: 100 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(repository as any, {} as any);
    jest.spyOn(service as any, 'getOwnedProduct').mockResolvedValue({ ...product });
    jest.spyOn(service, 'toManageCard').mockImplementation((value) => value as any);
    repository.update.mockImplementation(async (_id, data) => ({ ...product, ...data }));
    repository.findByIdWithSeller.mockImplementation(async () => ({ ...product }));
  });

  it('calculates variant selling price from base price plus adjustment', () => {
    const variants = (service as any).buildVariants(
      [
        {
          id: 'variant-id',
          sku: 'SKU-1',
          attributes: { size: 'Large' },
          priceAdjustmentAmount: 25,
          stockQty: 2,
        },
      ],
      100,
    );

    expect(variants[0]).toMatchObject({
      price: { amount: 125, currency: 'NGN' },
      priceAdjustment: { amount: 25, currency: 'NGN' },
      stockQty: 2,
      isInStock: true,
    });
  });

  it('does not allow a negative final variant price', () => {
    expect(() =>
      (service as any).buildVariants(
        [{ id: 'variant-id', sku: 'SKU-1', attributes: {}, priceAdjustmentAmount: -101 }],
        100,
      ),
    ).toThrow(BadRequestException);
  });

  it('keeps a new product private until the seller explicitly sets it Live', async () => {
    await service.setPublicationStatus('product-id', 'live', sellerUser);

    expect(repository.update).toHaveBeenCalledWith(
      'product-id',
      expect.objectContaining({ publicationStatus: 'live', isActive: true }),
    );
  });

  it('does not reactivate a deactivated listing when its status is changed', async () => {
    jest.spyOn(service as any, 'getOwnedProduct').mockResolvedValueOnce({
      ...product,
      publicationStatus: 'live',
      isDeactivated: true,
    });

    await service.setPublicationStatus('product-id', 'live', sellerUser);

    expect(repository.update).toHaveBeenCalledWith(
      'product-id',
      expect.objectContaining({ publicationStatus: 'live', isActive: false }),
    );
  });

  it('only permits recommendations for approved Live listings', async () => {
    await expect(service.setRecommended('product-id', true, sellerUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('duplicates a product as a Draft with new SKUs and zero stock', async () => {
    const createMyProduct = jest
      .spyOn(service, 'createMyProduct')
      .mockResolvedValue({ id: 'copy-id' } as any);
    const original = {
      ...product,
      name: 'Sample product',
      sku: 'ORIGINAL',
      brand: 'Brand',
      gallery: [],
      variantAxes: [],
      originalPrice: null,
      defaultVariantId: null,
      variants: [
        {
          id: 'old-variant',
          sku: 'OLD-SKU',
          attributes: { size: 'Large' },
          price: { amount: 125 },
          priceAdjustment: { amount: 25 },
          stockQty: 8,
          images: [],
        },
      ],
    };
    jest.spyOn(service as any, 'getOwnedProduct').mockResolvedValueOnce(original);

    await service.duplicateProduct('product-id', sellerUser);

    const duplicate = createMyProduct.mock.calls[0][0] as any;
    expect(duplicate.name).toBe('Sample product (copy)');
    expect(duplicate.sku).not.toBe('ORIGINAL');
    expect(duplicate.variants[0].sku).not.toBe('OLD-SKU');
    expect(duplicate.variants[0].stockQty).toBe(0);
    expect(duplicate.inventoryStatus).toBe('out_of_stock');
  });

  it('returns a seller-owned product sales series with the requested period', async () => {
    const bucket = new Date('2026-10-01T00:00:00.000Z');
    const salesRepository = {
      getSalesSeries: jest.fn().mockResolvedValue([{ bucket, unitsSold: 3 }]),
    };
    service = new ProductsService(salesRepository as any, {} as any);
    jest.spyOn(service as any, 'getOwnedProduct').mockResolvedValue({
      ...product,
      name: 'Sample product',
      _id: { toString: () => 'product-id' },
    });

    const result = await service.getMyProductSales('product-id', sellerUser, {
      interval: 'month',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
    });

    expect(salesRepository.getSalesSeries).toHaveBeenCalledWith(
      'product-id',
      'month',
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T23:59:59.999Z'),
    );
    expect(result).toMatchObject({
      product: { id: 'product-id', name: 'Sample product' },
      interval: 'month',
      series: [{ periodStart: '2026-10-01T00:00:00.000Z', unitsSold: 3 }],
    });
  });
});
