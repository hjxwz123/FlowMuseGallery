import { ArrayMinSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class ReorderModelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  modelIds!: string[];
}
