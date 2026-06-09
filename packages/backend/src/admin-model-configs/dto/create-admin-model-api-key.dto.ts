import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminModelApiKeyDto {
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
