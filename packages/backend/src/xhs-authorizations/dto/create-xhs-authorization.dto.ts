import { IsString, MinLength } from 'class-validator';

export class CreateXhsAuthorizationDto {
  @IsString()
  @MinLength(8)
  cookie!: string;
}
