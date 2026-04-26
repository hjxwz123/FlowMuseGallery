import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OptimizePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16000)
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  modelType?: string; // 模型类型，如 'midjourney', 'qwen' 等，用于选择不同的优化策略

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  projectDescription?: string;

  @IsOptional()
  @IsString()
  @IsIn(['default', 'video_director', 'project_description', 'project_storyboard'])
  task?: 'default' | 'video_director' | 'project_description' | 'project_storyboard';
}
