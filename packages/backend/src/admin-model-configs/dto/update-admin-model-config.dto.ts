import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminModelConfigDto {
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  modelName!: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
