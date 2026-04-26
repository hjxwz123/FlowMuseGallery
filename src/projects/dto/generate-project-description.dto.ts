import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateProjectDescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  concept?: string;
}
