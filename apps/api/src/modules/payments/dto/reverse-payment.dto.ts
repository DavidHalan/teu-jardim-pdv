import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ReversePaymentRequest } from '@teu-jardim/shared';

export class ReversePaymentDto implements ReversePaymentRequest {
  // Motivo obrigatório (RB-048 — auditoria).
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}
