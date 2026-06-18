import type { PlaceItemsRequest, ProductDto } from '@teu-jardim/shared';

/** Uma linha do carrinho em montagem (cliente). `key` distingue linhas do mesmo produto. */
export interface CartLine {
  key: string;
  product: ProductDto;
  quantity: number; // UNIT
  weightGrams: number | null; // WEIGHED
  observationIds: string[];
}

/**
 * Total da linha só para PREVIEW de exibição (RB-014). O servidor recalcula com Decimal
 * na confirmação e é a fonte da verdade dos totais — aqui Number basta para mostrar.
 */
export function previewLineTotal(line: CartLine): number {
  const price = Number(line.product.price);
  if (line.product.type === 'WEIGHED') {
    return ((line.weightGrams ?? 0) / 1000) * price;
  }
  return line.quantity * price;
}

/** Soma de preview do carrinho. */
export function previewCartTotal(lines: CartLine[]): number {
  return lines.reduce((acc, l) => acc + previewLineTotal(l), 0);
}

/** Mapeia o carrinho para o corpo do POST /accounts/:id/items (omite campos vazios). */
export function toPlaceItems(lines: CartLine[]): PlaceItemsRequest {
  return {
    items: lines.map((l) => {
      if (l.product.type === 'WEIGHED') {
        return { productId: l.product.id, weightGrams: l.weightGrams ?? 0 };
      }
      const base: { productId: string; quantity: number; observationIds?: string[] } = {
        productId: l.product.id,
        quantity: l.quantity,
      };
      if (l.observationIds.length > 0) base.observationIds = l.observationIds;
      return base;
    }),
  };
}
