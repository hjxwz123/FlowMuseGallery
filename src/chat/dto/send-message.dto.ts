import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class SendMessageMediaAgentDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  modelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredAspectRatio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  referenceImages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  referenceVideos?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  referenceAudios?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredResolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredDuration?: string;

  @IsOptional()
  @IsBoolean()
  autoCreate?: boolean;
}

class SendMessageAutoProjectAgentDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsString()
  imageModelId!: string;

  @IsString()
  videoModelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredResolution?: string;

  @IsOptional()
  @IsBoolean()
  createProjectIfMissing?: boolean;
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  fileIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SendMessageMediaAgentDto)
  mediaAgent?: SendMessageMediaAgentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SendMessageMediaAgentDto)
  imageAgent?: SendMessageMediaAgentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SendMessageAutoProjectAgentDto)
  autoProjectAgent?: SendMessageAutoProjectAgentDto;
}
