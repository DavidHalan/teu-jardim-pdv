import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrintJobStatus } from '@teu-jardim/shared';
import type { AckPrintJobRequest } from '@teu-jardim/shared';

export class AckPrintJobDto implements AckPrintJobRequest {
  // Só os resultados do consumer; EXPIRED é policy do servidor (F-6 full), nunca ACK.
  @IsIn([PrintJobStatus.PRINTED, PrintJobStatus.FAILED])
  result!: PrintJobStatus.PRINTED | PrintJobStatus.FAILED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}
