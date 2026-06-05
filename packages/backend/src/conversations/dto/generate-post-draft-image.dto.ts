import { IsOptional, IsString } from 'class-validator';

export class GeneratePostDraftImageDto {
  @IsOptional()
  @IsString()
  imagePrompt?: string;
}
