import { IsNotEmpty, IsNumberString, IsString, MaxLength } from 'class-validator';
import type { CashWithdrawalRequest, CashSupplyRequest } from '@teu-jardim/shared';

// RB-052: valor + motivo obrigatórios (sangria e suprimento).
export class CashWithdrawalDto implements CashWithdrawalRequest {
  @IsNumberString()
  amount!: string;

  @IsString()
  @IsNotEmpty({ message: 'Motivo é obrigatório (RB-052).' })
  @MaxLength(200)
  reason!: string;
}

export class CashSupplyDto extends CashWithdrawalDto implements CashSupplyRequest {}
