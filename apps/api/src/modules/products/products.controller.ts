import { Controller, Get } from '@nestjs/common';
import type { CatalogResponse } from '@teu-jardim/shared';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // Leitura do catálogo: qualquer autenticado (garçom monta o pedido).
  @Get('catalog')
  catalog(): Promise<CatalogResponse> {
    return this.products.getCatalog();
  }
}
