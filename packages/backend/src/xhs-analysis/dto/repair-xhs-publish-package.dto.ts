import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { XhsImageTextPublishPackage } from '../domain';

export class RepairXhsPublishPackageDto {
  @IsString()
  @MinLength(1)
  idea!: string;

  @IsObject()
  publishPackage!: XhsImageTextPublishPackage;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  repairActions?: string[];
}
