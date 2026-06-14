import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { OpenSessionRequest } from '@teu-jardim/shared';

export class OpenSessionDto implements OpenSessionRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
