import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @Matches(/^\d+$/)
  modelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
