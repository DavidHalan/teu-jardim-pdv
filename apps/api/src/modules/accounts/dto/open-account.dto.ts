import { IsEnum, IsInt, Min } from 'class-validator';
import { TabType } from '@teu-jardim/shared';
import type { OpenAccountRequest } from '@teu-jardim/shared';

export class OpenAccountDto implements OpenAccountRequest {
  @IsEnum(TabType)
  tabType!: TabType;

  @IsInt()
  @Min(1)
  number!: number;
}
