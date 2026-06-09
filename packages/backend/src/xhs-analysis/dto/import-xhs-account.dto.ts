import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import type { AdminContentProviderType } from '../../admin-content-providers/admin-content-providers.types';

export class ImportXhsAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  conversationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['tikhub', 'custom'])
  providerType?: AdminContentProviderType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  url?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string;
}
