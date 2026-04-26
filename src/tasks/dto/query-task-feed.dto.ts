import { IsIn, IsOptional } from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryTaskFeedDto extends PaginationDto {
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed'])
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
