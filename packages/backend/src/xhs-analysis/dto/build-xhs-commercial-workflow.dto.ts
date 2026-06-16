import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type {
  XhsImportedAccountRecord,
  XhsImportedPostRecord,
} from '../domain';

export class BuildXhsCommercialWorkflowDto {
  @IsOptional()
  @IsObject()
  account?: XhsImportedAccountRecord;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsString()
  @MinLength(1)
  idea!: string;

  @ArrayMinSize(1)
  @IsArray()
  @IsString({ each: true })
  outline!: string[];

  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @IsOptional()
  @IsArray()
  posts?: XhsImportedPostRecord[];

  @IsOptional()
  @IsString()
  tone?: string;
}
