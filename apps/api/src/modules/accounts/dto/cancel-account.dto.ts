import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CancelAccountRequest } from '@teu-jardim/shared';

export class CancelAccountDto implements CancelAccountRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}
