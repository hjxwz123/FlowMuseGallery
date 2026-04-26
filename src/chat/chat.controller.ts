import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateChatImageTaskDto } from './dto/create-chat-image-task.dto';
import { CreateChatVideoTaskDto } from './dto/create-chat-video-task.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  listConversations(@CurrentUser('id') userId: bigint, @Query('q') q?: string) {
    return this.chatService.listConversations(userId, q);
  }

  @Post('conversations')
  createConversation(@CurrentUser('id') userId: bigint, @Body() dto: CreateConversationDto) {
    return this.chatService.createConversation(userId, dto);
  }

  @Delete('conversations/:id')
  removeConversation(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.chatService.removeConversation(userId, id);
  }

  @Patch('conversations/:id')
  updateConversation(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chatService.updateConversation(userId, id, dto);
  }

  @Get('conversations/:id/messages')
  getMessages(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.chatService.getMessages(userId, id);
  }

  @Delete('conversations/:id/messages/:messageId/turn')
  removeMessageTurn(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.removeMessageTurn(userId, id, messageId);
  }

  @Post('conversations/:id/messages')
  sendMessage(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(userId, id, dto);
  }

  @Post('conversations/:id/image-tasks')
  createImageTask(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: CreateChatImageTaskDto,
  ) {
    return this.chatService.createImageTask(userId, id, dto);
  }

  @Post('conversations/:id/video-tasks')
  createVideoTask(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: CreateChatVideoTaskDto,
  ) {
    return this.chatService.createVideoTask(userId, id, dto);
  }

  @Post('conversations/:id/files')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadFiles(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.chatService.uploadFiles(userId, id, files);
  }

  @Post('conversations/:id/messages/stream')
  async streamMessage(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    await this.chatService.streamMessage(userId, id, dto, res);
  }
}
