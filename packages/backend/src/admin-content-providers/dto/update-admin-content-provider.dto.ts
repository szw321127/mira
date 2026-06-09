import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAdminContentProviderDto {
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @IsOptional()
  @IsString()
  complianceNote?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerMinute?: number;
}
