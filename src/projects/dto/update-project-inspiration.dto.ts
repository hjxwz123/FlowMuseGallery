import { PartialType } from '@nestjs/mapped-types';

import { CreateProjectInspirationDto } from './create-project-inspiration.dto';

export class UpdateProjectInspirationDto extends PartialType(CreateProjectInspirationDto) {}
