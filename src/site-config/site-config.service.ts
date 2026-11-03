import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';

type LegalPage = {
  title: string;
  contentHtml: string;
  updatedAt: string;
};

@Injectable()
export class SiteConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const configs = await this.prisma.siteConfig.findMany();
    const result: Record<string, any> = {};

    for (const config of configs) {
      result[config.key] = config.value;
    }

    if (Object.keys(result).length === 0) {
      return this.getDefaults();
    }

    return this.normalizeConfig(result);
  }

  async getPublicConfig() {
    return this.getConfig();
  }

  async getLegalPage(slug: string) {
    const normalizedSlug = slug.trim().toLowerCase();
    const configs = await this.prisma.siteConfig.findMany();
    const raw: Record<string, any> = {};

    for (const config of configs) {
      raw[config.key] = config.value;
    }

    const configuredPages = this.extractConfiguredLegalPages(raw);
    const defaults = this.getDefaultLegalPages();
    const page =
      configuredPages[normalizedSlug] ?? defaults[normalizedSlug as keyof typeof defaults];

    if (!page) {
      throw new NotFoundException('Legal page not found');
    }

    return {
      slug: normalizedSlug,
      title: page.title,
      contentHtml: page.contentHtml,
      updatedAt: page.updatedAt,
    };
  }

  private getDefaults() {
    return {
      footer: {
        aboutText:
          'Cadna Mart is your trusted online marketplace for quality products and fast delivery.',
        links: [
          { label: 'About Us', url: '/about' },
          { label: 'Contact Us', url: '/contact' },
          { label: 'Returns', url: '/policies/returns' },
          { label: 'Privacy Policy', url: '/privacy' },
        ],
      },
      socialLinks: [],
      contact: {
        email: 'support@cadnamart.com',
        phone: '+234 800 000 0000',
      },
    };
  }

  private getDefaultLegalPages() {
    const today = new Date().toISOString();

    return {
      terms: {
        title: 'Terms of Service',
        contentHtml:
          '<p>By using Cadna Mart, you agree to our marketplace terms, order policies, and acceptable-use rules.</p>',
        updatedAt: today,
      },
      privacy: {
        title: 'Privacy Policy',
        contentHtml:
          '<p>Cadna Mart processes account, order, and support data only as needed to deliver the service and meet compliance obligations.</p>',
        updatedAt: today,
      },
      returns: {
        title: 'Returns Policy',
        contentHtml:
          '<p>Return eligibility depends on product condition, category restrictions, and the applicable seller or platform policy window.</p>',
        updatedAt: today,
      },
    } satisfies Record<string, LegalPage>;
  }

  private normalizeConfig(raw: Record<string, any>) {
    const defaults = this.getDefaults();

    const footerFromRaw = raw.footer ?? {};
    const linksFromRaw = Array.isArray(footerFromRaw.links)
      ? footerFromRaw.links
      : [
          ...(Array.isArray(footerFromRaw.companyLinks) ? footerFromRaw.companyLinks : []),
          ...(Array.isArray(footerFromRaw.supportLinks) ? footerFromRaw.supportLinks : []),
        ];

    const socialLinks = Array.isArray(raw.socialLinks)
      ? raw.socialLinks
      : this.socialObjectToArray(raw.social ?? {});

    return {
      footer: {
        aboutText: footerFromRaw.aboutText ?? defaults.footer.aboutText,
        links: linksFromRaw.length > 0 ? linksFromRaw : defaults.footer.links,
      },
      socialLinks,
      contact: {
        email: raw.contact?.email ?? defaults.contact.email,
        phone: raw.contact?.phone ?? defaults.contact.phone,
      },
    };
  }

  private socialObjectToArray(social: Record<string, unknown>) {
    return Object.entries(social)
      .filter(([, url]) => typeof url === 'string' && url.trim().length > 0)
      .map(([platform, url]) => ({ platform, url: String(url) }));
  }

  private extractConfiguredLegalPages(raw: Record<string, any>) {
    const legalPagesCandidate = raw.legalPages ?? raw.legal?.pages ?? {};
    if (typeof legalPagesCandidate !== 'object' || legalPagesCandidate === null) {
      return {};
    }

    return Object.entries(legalPagesCandidate).reduce<Record<string, LegalPage>>(
      (acc, [slug, rawValue]) => {
        if (typeof rawValue !== 'object' || rawValue === null) {
          return acc;
        }

        const value = rawValue as {
          title?: unknown;
          contentHtml?: unknown;
          content?: unknown;
          updatedAt?: unknown;
        };

        const title =
          typeof value.title === 'string' && value.title.trim().length > 0
            ? value.title.trim()
            : `${slug[0]?.toUpperCase() ?? ''}${slug.slice(1)}`;
        const contentHtml =
          typeof value.contentHtml === 'string'
            ? value.contentHtml
            : typeof value.content === 'string'
              ? value.content
              : '';
        const updatedAt =
          typeof value.updatedAt === 'string' && value.updatedAt.trim().length > 0
            ? value.updatedAt
            : new Date().toISOString();

        if (!contentHtml.trim()) {
          return acc;
        }

        acc[slug.toLowerCase()] = { title, contentHtml, updatedAt };
        return acc;
      },
      {},
    );
  }
}
