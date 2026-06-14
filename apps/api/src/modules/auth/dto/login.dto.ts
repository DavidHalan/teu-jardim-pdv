import { IsString, IsNotEmpty } from 'class-validator';
import type { LoginRequest } from '@teu-jardim/shared';

export class LoginDto implements LoginRequest {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
