import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateProjectInspirationPromptDto {
  @IsOptional()
  @IsBoolean()
  includeProjectDescription?: boolean;

  @IsOptional()
  @IsBoolean()
  includePreviousInspirations?: boolean;

  @IsOptional()
  @IsBoolean()
  includePreviousContextText?: boolean;

  @IsOptional()
  @IsBoolean()
  includePreviousPlotText?: boolean;
}
