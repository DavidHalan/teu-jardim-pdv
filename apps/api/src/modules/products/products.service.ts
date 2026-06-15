import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductType } from '@teu-jardim/shared';
import type { CatalogResponse, CategoryDto, ProductDto } from '@teu-jardim/shared';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo ativo agrupado por categoria (RB-017: só ativos). */
  async getCatalog(): Promise<CatalogResponse> {
    const categories = await this.prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: { active: true },
          orderBy: { name: 'asc' },
          include: { observations: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    return {
      categories: categories.map(
        (c): CategoryDto => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
          products: c.products.map(
            (p): ProductDto => ({
              id: p.id,
              categoryId: p.categoryId,
              name: p.name,
              price: p.price.toFixed(2), // Decimal→string canônica (RB-047)
              type: p.type as ProductType, // cast na borda Prisma→shared
              usesObservations: p.usesObservations,
              observations: p.observations.map((o) => ({ id: o.id, name: o.name })),
            }),
          ),
        }),
      ),
    };
  }
}
