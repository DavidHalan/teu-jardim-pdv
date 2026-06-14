import { IsNotEmpty, IsNumberString } from 'class-validator';
import type { OpenRegisterRequest } from '@teu-jardim/shared';

export class OpenRegisterDto implements OpenRegisterRequest {
  // String decimal canônica (ex.: "100.00") — dinheiro nunca como float (RB-047).
  @IsNotEmpty()
  @IsNumberString()
  openingAmount!: string;
}
