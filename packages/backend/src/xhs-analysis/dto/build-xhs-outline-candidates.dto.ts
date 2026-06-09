import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { XhsGenerationBrief } from '@rednote/agent';

export class BuildXhsOutlineCandidatesDto {
  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsObject()
  brief?: XhsGenerationBrief;

  @IsString()
  @MinLength(1)
  idea!: string;
}
