import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import type { PlaceItemInput, PlaceItemsRequest } from '@teu-jardim/shared';

export class PlaceItemDto implements PlaceItemInput {
  @IsUUID()
  productId!: string;

  // UNIT: quantidade (default 1 no service). WEIGHED ignora.
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // WEIGHED: peso em gramas, inteiro positivo (RB-014). UNIT ignora.
  @IsOptional()
  @IsInt()
  @Min(1)
  weightGrams?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  observationIds?: string[];
}

export class PlaceItemsDto implements PlaceItemsRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PlaceItemDto)
  items!: PlaceItemDto[];
}
