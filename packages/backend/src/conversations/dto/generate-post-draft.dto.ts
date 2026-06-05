import { IsOptional, IsString } from 'class-validator';

export class GeneratePostDraftDto {
  @IsOptional()
  @IsString()
  outlineId?: string;
}
