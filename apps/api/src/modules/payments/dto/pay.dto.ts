import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsNumberString, IsUUID, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@teu-jardim/shared';
import type { PayRequest, PaymentTenderInput } from '@teu-jardim/shared';

export class TenderDto implements PaymentTenderInput {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsNumberString()
  amount!: string;
}

export class PayDto implements PayRequest {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  accountIds!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TenderDto)
  tenders!: TenderDto[];
}
