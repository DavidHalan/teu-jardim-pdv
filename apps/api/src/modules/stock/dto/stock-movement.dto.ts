import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { StockMovementType } from '@teu-jardim/shared';
import type { StockMovementRequest } from '@teu-jardim/shared';

export class StockMovementDto implements StockMovementRequest {
  @IsUUID()
  productId!: string;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  // Decimal assinado com até 3 casas (ADJUST aceita negativo; sinal validado no service).
  @Matches(/^-?\d+(\.\d{1,3})?$/, { message: 'quantity deve ser decimal com até 3 casas' })
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
