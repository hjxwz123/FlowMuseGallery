import { IsIn, IsOptional, IsString } from 'class-validator';

export class UploadSeedanceInputsDto {
  @IsString()
  @IsIn(['image', 'video', 'audio'])
  kind!: 'image' | 'video' | 'audio';

  @IsOptional()
  @IsString()
  @IsIn(['seedance', 'wanx'])
  provider?: 'seedance' | 'wanx';
}
