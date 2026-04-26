import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListImportableWorksDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsIn(['image', 'video'])
  type?: 'image' | 'video' = 'image';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
