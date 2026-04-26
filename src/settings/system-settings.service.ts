import { Injectable } from '@nestjs/common';

import { ChatFileSettings, DEFAULT_CHAT_FILE_SETTINGS } from './system-settings.constants';

@Injectable()
export class SystemSettingsService {
  async getChatFileSettings(): Promise<ChatFileSettings> {
    return { ...DEFAULT_CHAT_FILE_SETTINGS };
  }
}
