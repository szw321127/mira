import { IsObject } from 'class-validator';
import type { JsonRecord } from '../../common/json';

export class CreateSnapshotDto {
  @IsObject()
  snapshot!: JsonRecord;
}
