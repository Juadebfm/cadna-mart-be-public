import { Injectable } from '@nestjs/common';
import { ProductsRepository } from '@products/products.repository';
import { ProductsService } from '@products/products.service';
import { ProductQueryDto, ProductSortOption } from '@products/dto/product-query.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productsService: ProductsService,
  ) {}

  async suggest(q: string, limit: number) {
    if (!q || q.trim().length < 2) {
      return { items: [] };
    }

    const products = await this.productsRepository.searchSuggest(q.trim(), limit);
    return {
      items: products.map((p) => ({
        id: (p as unknown as { _id: { toString(): string } })._id.toString(),
        name: p.name,
        slug: p.slug,
        thumbnailUrl: p.thumbnailUrl,
        price: p.price,
        brand: p.brand,
      })),
    };
  }

  async search(params: {
    q?: string;
    page?: number;
    limit?: number;
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
  }) {
    const validSorts = Object.values(ProductSortOption) as string[];
    const sort: ProductSortOption =
      params.sort && validSorts.includes(params.sort)
        ? (params.sort as ProductSortOption)
        : ProductSortOption.RELEVANCE;

    const query: ProductQueryDto = {
      q: params.q,
      page: Math.max(Number(params.page) || 1, 1),
      limit: Math.min(Math.max(Number(params.limit) || 20, 1), 50),
      category: params.category,
      brand: params.brand,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      sort,
    } as ProductQueryDto;

    return this.productsService.findAll(query);
  }
}
