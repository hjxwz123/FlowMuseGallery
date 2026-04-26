import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

