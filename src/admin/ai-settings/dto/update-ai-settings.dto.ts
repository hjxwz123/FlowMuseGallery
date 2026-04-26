import { IsOptional, IsString } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  modelName?: string;

}
