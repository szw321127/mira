import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import type { XhsPostInput } from '@rednote/agent/xhs-analysis';

type XhsMetricValue = number | string | null | undefined;

export class AnalyzeXhsAccountDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  followers?: XhsMetricValue;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  posts!: XhsPostInput[];

  @IsOptional()
  @IsString()
  url?: string;
}
