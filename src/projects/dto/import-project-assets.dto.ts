import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';

class ImportProjectAssetItemDto {
  @IsString()
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsString()
  id!: string;
}

export class ImportProjectAssetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportProjectAssetItemDto)
  items!: ImportProjectAssetItemDto[];
}
