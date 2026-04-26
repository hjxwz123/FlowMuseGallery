import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { StorageSettingsService } from '../../settings/storage-settings.service';
import { ReorderModelsDto } from '../models/dto/reorder-models.dto';
import { AdminChatModelsService } from './admin-chat-models.service';
import { CreateChatModelDto } from './dto/create-chat-model.dto';
import { UpdateChatModelDto } from './dto/update-chat-model.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { UpdateStorageSettingsDto } from './dto/update-storage-settings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/ai')
export class AdminAiSettingsController {
  constructor(
    private readonly aiSettings: AiSettingsService,
    private readonly storageSettings: StorageSettingsService,
    private readonly chatModelsService: AdminChatModelsService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.aiSettings.getAiSettingsForAdmin();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateAiSettingsDto) {
    return this.aiSettings.setAiSettings(dto);
  }

  @Get('storage')
  getStorageSettings() {
    return this.storageSettings.getStorageSettingsForAdmin();
  }

  @Put('storage')
  updateStorageSettings(@Body() dto: UpdateStorageSettingsDto) {
    return this.storageSettings.setStorageSettings(dto);
  }

  @Get('chat-models')
  listChatModels() {
    return this.chatModelsService.list();
  }

  @Post('chat-models')
  createChatModel(@Body() dto: CreateChatModelDto) {
    return this.chatModelsService.create(dto);
  }

  @Post('chat-models/reorder')
  reorderChatModels(@Body() dto: ReorderModelsDto) {
    return this.chatModelsService.reorder(dto);
  }

  @Patch('chat-models/:id')
  updateChatModel(@Param('id') id: string, @Body() dto: UpdateChatModelDto) {
    return this.chatModelsService.update(id, dto);
  }

  @Delete('chat-models/:id')
  removeChatModel(@Param('id') id: string) {
    return this.chatModelsService.remove(id);
  }
}
