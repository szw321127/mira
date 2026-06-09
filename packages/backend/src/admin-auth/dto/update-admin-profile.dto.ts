import { IsString, MinLength } from 'class-validator';

export class UpdateAdminProfileDto {
  @IsString()
  @MinLength(1)
  displayName!: string;
}
