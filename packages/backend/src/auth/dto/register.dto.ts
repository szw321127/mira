import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  account!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
