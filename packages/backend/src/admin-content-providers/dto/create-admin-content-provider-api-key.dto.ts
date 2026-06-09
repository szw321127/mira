import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminContentProviderApiKeyDto {
  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsString()
  @MinLength(1)
  name!: string;
}
