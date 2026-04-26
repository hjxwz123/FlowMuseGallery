import { IsEnum, IsString, MaxLength } from 'class-validator';
import { ProjectPromptType } from '../../common/prisma-enums';

export class CreateProjectPromptDto {
  @IsEnum(ProjectPromptType)
  type!: ProjectPromptType;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(20000)
  prompt!: string;
}
