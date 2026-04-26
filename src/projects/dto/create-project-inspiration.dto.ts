import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateProjectInspirationDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(12000)
  ideaText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  contextText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  plotText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  episodeNumber?: number;
}
