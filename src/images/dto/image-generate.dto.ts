import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ImageGenerateDto {
  @IsString()
  modelId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  skipProjectPromptTransform?: boolean;
}
