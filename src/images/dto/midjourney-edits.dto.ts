import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class MidjourneyEditsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsNotEmpty()
  @IsString()
  image!: string; // 原图 URL

  @IsOptional()
  @IsString()
  maskBase64?: string; // 蒙版 base64（原图在需要编辑的地方变为透明）
}
