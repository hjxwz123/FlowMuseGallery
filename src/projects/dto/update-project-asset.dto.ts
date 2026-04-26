import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
