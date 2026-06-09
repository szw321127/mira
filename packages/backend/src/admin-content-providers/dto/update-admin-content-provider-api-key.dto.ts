import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminContentProviderApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
