import { IsOptional, IsString } from 'class-validator';

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
  topic?: string;
}
