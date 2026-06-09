import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  account!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
