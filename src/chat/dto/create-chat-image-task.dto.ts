import { ArrayMaxSize, IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatImageTaskDto {
  @IsString()
  modelId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredAspectRatio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredResolution?: string;

  @IsOptional()
  @IsBoolean()
  useConversationContextEdit?: boolean;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  userMessageContent?: string;

  @IsOptional()
  @IsString()
  sourceAssistantMessageId?: string;
}
