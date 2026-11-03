import { Injectable } from '@nestjs/common';
import { ProductsService } from '@products/products.service';
import { CategoriesService } from '@categories/categories.service';
import { BannersRepository } from '@banners/banners.repository';
import { BannerType } from '@banners/schemas/banner.schema';

@Injectable()
export class HomeService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly bannersRepository: BannersRepository,
  ) {}

  async getHomepage(limitPerSection: number, location?: string) {
    const normalizedLocation = location?.trim().toLowerCase() || undefined;
    const sections = ['best_deals', 'recommended', 'top_sellers', 'new_arrivals'];
    const sectionTitles: Record<string, string> = {
      best_deals: 'Get the best deals',
      recommended: 'Recommended Products For You',
      top_sellers: 'Featured Products From Our Top Sellers',
      new_arrivals: 'New Arrivals',
    };

    const [heroBanners, campaignBanners, growthCards, topCategories, ...sectionProducts] =
      await Promise.all([
        this.bannersRepository.findByType(BannerType.HERO, normalizedLocation),
        this.bannersRepository.findByType(BannerType.CAMPAIGN, normalizedLocation),
        this.bannersRepository.findByType(BannerType.GROWTH_CARD, normalizedLocation),
        this.categoriesService.findAll(false, true),
        ...sections.map((section) => this.productsService.findBySection(section, limitPerSection)),
      ]);

    const toDto = (banner: {
      _id?: unknown;
      title: string;
      subtitle?: string | null;
      description?: string | null;
      imageUrl?: string | null;
      mobileImageUrl?: string | null;
      ctaLabel?: string | null;
      ctaUrl?: string | null;
      discountLabel?: string | null;
      startAt?: Date | null;
      endAt?: Date | null;
    }) => {
      const id = (banner as unknown as { _id: { toString(): string } })._id.toString();
      return {
        id,
        title: banner.title,
        subtitle: banner.subtitle ?? null,
        description: banner.description ?? null,
        imageUrl: banner.imageUrl ?? null,
        mobileImageUrl: banner.mobileImageUrl ?? null,
        ctaLabel: banner.ctaLabel ?? null,
        ctaUrl: banner.ctaUrl ?? null,
        discountLabel: banner.discountLabel ?? null,
        startAt: banner.startAt ?? null,
        endAt: banner.endAt ?? null,
      };
    };

    return {
      heroBanners: heroBanners.map(toDto),
      sections: sections.map((key, i) => ({
        key,
        title: sectionTitles[key],
        viewAllUrl: `/products?section=${key}`,
        products: sectionProducts[i].map((p) => this.productsService.toCard(p)),
      })),
      topCategories: topCategories.items.slice(0, 10),
      campaignBanners: campaignBanners.map(toDto),
      growthCards: growthCards.map(toDto),
    };
  }
}
