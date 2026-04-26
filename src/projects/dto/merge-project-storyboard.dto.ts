import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class MergeProjectStoryboardDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  shotIds?: string[];
}
