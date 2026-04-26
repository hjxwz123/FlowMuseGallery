import { IsOptional, IsString } from 'class-validator';

export class UpdateStorageSettingsDto {
  @IsOptional()
  @IsString()
  cosSecretId?: string;

  @IsOptional()
  @IsString()
  cosSecretKey?: string;

  @IsOptional()
  @IsString()
  cosBucket?: string;

  @IsOptional()
  @IsString()
  cosRegion?: string;

  @IsOptional()
  @IsString()
  cosPublicBaseUrl?: string;

  @IsOptional()
  @IsString()
  cosPrefix?: string;
}
