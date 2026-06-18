import { IsNumberString } from 'class-validator';
import type { CloseRegisterRequest } from '@teu-jardim/shared';

export class CloseRegisterDto implements CloseRegisterRequest {
  @IsNumberString()
  countedAmount!: string;
}
