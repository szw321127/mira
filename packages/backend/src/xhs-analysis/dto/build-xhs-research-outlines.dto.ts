import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { XhsResearchMode } from '../domain';

export class BuildXhsResearchOutlinesDto {
  @IsString()
  @MinLength(1)
  conversationId!: string;

  @IsString()
  @MinLength(1)
  idea!: string;

  @IsOptional()
  @IsIn(['deep', 'quick'])
  mode?: XhsResearchMode;
}
