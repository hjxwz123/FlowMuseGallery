import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateModelDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  modelKey!: string;

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsString()
  @IsIn(['image', 'video', 'chat'])
  type!: 'image' | 'video' | 'chat';

  @IsString()
  @MaxLength(50)
  provider!: string;

  @IsString()
  channelId!: string;

  @IsOptional()
  @IsObject()
  defaultParams?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  paramConstraints?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  supportsImageInput?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsResolutionSelect?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsSizeSelect?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsQuickMode?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsAgentMode?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsAutoMode?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxContextRounds?: number | null;
}
