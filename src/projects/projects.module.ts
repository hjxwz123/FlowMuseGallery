import { Module } from '@nestjs/common';

import { ChatFileParserService } from '../chat/chat-file-parser.service';
import { PromptOptimizeModule } from '../prompt-optimize/prompt-optimize.module';
import { SettingsModule } from '../settings/settings.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [PromptOptimizeModule, SettingsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ChatFileParserService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
