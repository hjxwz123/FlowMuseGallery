import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MidjourneyModalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsString()
  maskBase64?: string;
}

