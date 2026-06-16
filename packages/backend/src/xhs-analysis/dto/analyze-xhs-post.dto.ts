import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { XhsPostMetrics } from '../domain';

export class AnalyzeXhsPostDto {
  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsObject()
  metrics?: XhsPostMetrics;

  @IsOptional()
  @IsString()
  publishTime?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;
}
