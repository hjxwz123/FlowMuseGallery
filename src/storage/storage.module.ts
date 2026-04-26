import { Global, Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
