import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CancelItemRequest } from '@teu-jardim/shared';

export class CancelItemDto implements CancelItemRequest {
  // Motivo obrigatório (RB-031 — auditoria).
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}
