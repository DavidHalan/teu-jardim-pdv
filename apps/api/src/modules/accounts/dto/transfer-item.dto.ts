import { IsUUID } from 'class-validator';
import type { TransferItemRequest } from '@teu-jardim/shared';

export class TransferItemDto implements TransferItemRequest {
  @IsUUID()
  toAccountId!: string;
}
