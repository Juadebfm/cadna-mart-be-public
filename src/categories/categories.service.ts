import { Injectable } from '@nestjs/common';
import { CategoriesRepository, CategoryRecord } from './categories.repository';

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  productCount?: number;
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async findAll(tree: boolean, includeCounts: boolean): Promise<{ items: CategoryTreeNode[] }> {
    const categories = await this.categoriesRepository.findAll(includeCounts);
    const mapped = categories.map((category) => this.toDto(category, includeCounts));

    if (!tree) return { items: mapped.map((category) => ({ ...category, children: [] })) };
    return { items: this.buildTree(categories, includeCounts) };
  }

  findBySlug(slug: string): Promise<CategoryRecord | null> {
    return this.categoriesRepository.findBySlug(slug);
  }

  private buildTree(categories: CategoryRecord[], includeCounts: boolean): CategoryTreeNode[] {
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    for (const category of categories) {
      map.set(category.id, { ...this.toDto(category, includeCounts), children: [] });
    }

    for (const category of categories) {
      const node = map.get(category.id)!;
      if (category.parentId && map.has(category.parentId)) {
        map.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private toDto(category: CategoryRecord, includeCounts: boolean): CategoryTreeNode {
    const dto: CategoryTreeNode = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      iconUrl: category.iconUrl,
      children: [],
    };
    if (includeCounts) dto.productCount = category.productCount;
    return dto;
  }
}
