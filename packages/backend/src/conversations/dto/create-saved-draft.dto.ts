import { IsObject, IsOptional, IsString } from 'class-validator';
import type { JsonRecord } from '../../common/json';

export class CreateSavedDraftDto {
  @IsOptional()
  @IsString()
  postDraftId?: string;

  @IsOptional()
  @IsObject()
  snapshot?: JsonRecord;
}
