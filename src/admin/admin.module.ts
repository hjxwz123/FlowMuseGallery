import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { AdminAiSettingsController } from './ai-settings/admin-ai-settings.controller';
import { AdminChatModelsService } from './ai-settings/admin-chat-models.service';
import { AdminChannelsController } from './channels/admin-channels.controller';
import { AdminChannelsService } from './channels/admin-channels.service';
import { DefaultApiChannelsService } from './channels/default-api-channels';
import { AdminConfigsController } from './configs/admin-configs.controller';
import { AdminConfigsService } from './configs/admin-configs.service';
import { AdminModelsController } from './models/admin-models.controller';
import { AdminModelsService } from './models/admin-models.service';
import { DefaultAiModelsService } from './models/default-ai-models';
import { AdminProvidersController } from './providers/admin-providers.controller';
import { AdminProvidersService } from './providers/admin-providers.service';

@Module({
  imports: [SettingsModule],
  controllers: [
    AdminProvidersController,
    AdminChannelsController,
    AdminModelsController,
    AdminConfigsController,
    AdminAiSettingsController,
  ],
  providers: [
    AdminProvidersService,
    AdminChannelsService,
    DefaultApiChannelsService,
    DefaultAiModelsService,
    AdminModelsService,
    AdminConfigsService,
    AdminChatModelsService,
  ],
})
export class AdminModule {}
