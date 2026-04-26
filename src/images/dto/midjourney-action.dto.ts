import { IsString, MaxLength, MinLength } from 'class-validator';

export class MidjourneyActionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  customId!: string;
}

