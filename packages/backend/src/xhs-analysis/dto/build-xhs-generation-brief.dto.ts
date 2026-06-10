import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type {
  XhsAccountAnalysis,
  XhsPostAnalysis,
} from '@rednote/agent/xhs-analysis';

export class BuildXhsGenerationBriefDto {
  @IsOptional()
  @IsObject()
  account?: XhsAccountAnalysis;

  @IsString()
  @MinLength(1)
  idea!: string;

  @IsArray()
  references!: XhsPostAnalysis[];
}
