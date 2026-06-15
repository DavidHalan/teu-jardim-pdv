import { describe, it, expect, vi } from 'vitest';
import { ProductsService } from './products.service';

const makeService = (categories: unknown) => {
  const prisma = { category: { findMany: vi.fn().mockResolvedValue(categories) } } as any;
  return { service: new ProductsService(prisma), prisma };
};

describe('ProductsService.getCatalog', () => {
  it('maps categories+products+observations and serializes price as string (RB-013/016/047)', async () => {
    const { service, prisma } = makeService([
      {
        id: 'c1',
        name: 'Sucos',
        sortOrder: 1,
        products: [
          {
            id: 'p1',
            categoryId: 'c1',
            name: 'Suco de Laranja',
            price: { toFixed: (_n: number) => '10.00' },
            type: 'UNIT',
            usesObservations: true,
            observations: [{ id: 'o1', name: 'Sem açúcar' }],
          },
        ],
      },
    ]);

    const out = await service.getCatalog();

    // só categorias e produtos ativos (RB-017)
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
    expect(out).toEqual({
      categories: [
        {
          id: 'c1',
          name: 'Sucos',
          sortOrder: 1,
          products: [
            {
              id: 'p1',
              categoryId: 'c1',
              name: 'Suco de Laranja',
              price: '10.00',
              type: 'UNIT',
              usesObservations: true,
              observations: [{ id: 'o1', name: 'Sem açúcar' }],
            },
          ],
        },
      ],
    });
  });
});
