import { IsEnum, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { DiscountType } from '@teu-jardim/shared';
import type { ApplyDiscountRequest } from '@teu-jardim/shared';

export class ApplyDiscountDto implements ApplyDiscountRequest {
  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsNumberString()
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
