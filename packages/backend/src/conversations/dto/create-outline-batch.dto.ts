import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOutlineBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;
}
