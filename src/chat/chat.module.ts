import { Module } from '@nestjs/common';

import { ImagesModule } from '../images/images.module';
import { SettingsModule } from '../settings/settings.module';
import { VideosModule } from '../videos/videos.module';
import { AutoProjectWorkflowService } from './auto-project-workflow.service';
import { ChatController } from './chat.controller';
import { ChatFileParserService } from './chat-file-parser.service';
import { ChatService } from './chat.service';

@Module({
  imports: [SettingsModule, ImagesModule, VideosModule],
  controllers: [ChatController],
  providers: [ChatService, ChatFileParserService, AutoProjectWorkflowService],
})
export class ChatModule {}
