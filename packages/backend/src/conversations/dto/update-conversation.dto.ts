import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  selectedOutlineId?: string;

  @IsOptional()
  @IsString()
  statusMessage?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  topic?: string;
}
