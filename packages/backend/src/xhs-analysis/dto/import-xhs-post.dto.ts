import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { AdminContentProviderType } from '../../admin-content-providers/admin-content-providers.types';

export class ImportXhsPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  noteId?: string;

  @IsOptional()
  @IsIn(['tikhub', 'custom'])
  providerType?: AdminContentProviderType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  url?: string;
}
