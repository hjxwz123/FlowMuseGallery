import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  modelId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  projectContextId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  clearProjectContext?: boolean;
}
