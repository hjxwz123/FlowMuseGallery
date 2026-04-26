import { IsIn, IsString } from 'class-validator';

export class UploadProjectAssetsDto {
  @IsString()
  @IsIn(['image', 'video', 'document'])
  kind!: 'image' | 'video' | 'document';
}
