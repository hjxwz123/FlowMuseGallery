import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { PromptOptimizeController } from './prompt-optimize.controller';
import { PromptOptimizeService } from './prompt-optimize.service';

@Module({
  imports: [SettingsModule],
  controllers: [PromptOptimizeController],
  providers: [PromptOptimizeService],
  exports: [PromptOptimizeService],
})
export class PromptOptimizeModule {}
