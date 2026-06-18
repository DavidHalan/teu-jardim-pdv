import { describe, it, expect } from 'vitest';
import { ProductType } from '@teu-jardim/shared';
import type { ProductDto } from '@teu-jardim/shared';
import { previewLineTotal, toPlaceItems, type CartLine } from './cart';

const unit: ProductDto = {
  id: 'p1', categoryId: 'c1', name: 'Suco', price: '10.00', type: ProductType.UNIT,
  usesObservations: true, observations: [{ id: 'o1', name: 'Sem açúcar' }],
};
const weighed: ProductDto = {
  id: 'p2', categoryId: 'c1', name: 'Self Service', price: '50.00', type: ProductType.WEIGHED,
  usesObservations: false, observations: [],
};

describe('previewLineTotal (preview de exibição; servidor é a fonte da verdade)', () => {
  it('UNIT: 10,00 × 2 = 20,00', () => {
    expect(previewLineTotal({ key: 'k', product: unit, quantity: 2, weightGrams: null, observationIds: [] })).toBe(20);
  });
  it('WEIGHED: 50,00/kg × 453 g = 22,65', () => {
    expect(previewLineTotal({ key: 'k', product: weighed, quantity: 1, weightGrams: 453, observationIds: [] })).toBeCloseTo(22.65, 2);
  });
});

describe('toPlaceItems (mapeia o carrinho para o request da API)', () => {
  it('UNIT manda quantity + observationIds; WEIGHED manda weightGrams', () => {
    const lines: CartLine[] = [
      { key: 'a', product: unit, quantity: 2, weightGrams: null, observationIds: ['o1'] },
      { key: 'b', product: weighed, quantity: 1, weightGrams: 453, observationIds: [] },
    ];
    expect(toPlaceItems(lines)).toEqual({
      items: [
        { productId: 'p1', quantity: 2, observationIds: ['o1'] },
        { productId: 'p2', weightGrams: 453 },
      ],
    });
  });
});
