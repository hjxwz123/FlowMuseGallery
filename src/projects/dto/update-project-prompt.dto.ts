import { PartialType } from '@nestjs/mapped-types';

import { CreateProjectPromptDto } from './create-project-prompt.dto';

export class UpdateProjectPromptDto extends PartialType(CreateProjectPromptDto) {}
