import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(50)
  provider!: string;

  @IsString()
  @MaxLength(500)
  baseUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiSecret?: string;

  @IsOptional()
  @IsObject()
  extraHeaders?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeout?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetry?: number;

  @IsOptional()
  @IsInt()
  rateLimit?: number;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

