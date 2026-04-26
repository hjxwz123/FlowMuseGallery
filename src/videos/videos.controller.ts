import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UploadSeedanceInputsDto } from './dto/upload-seedance-inputs.dto';
import { VideoGenerateDto } from './dto/video-generate.dto';
import { VideosService } from './videos.service';

@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('uploads/seedance-inputs')
  @UseInterceptors(
    FilesInterceptor('files', 9, {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadSeedanceInputs(
    @CurrentUser('id') userId: bigint,
    @Body() dto: UploadSeedanceInputsDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.videosService.uploadSeedanceInputs(userId, dto.kind, files, dto.provider ?? 'seedance');
  }

  @Post('generate')
  generate(@CurrentUser('id') userId: bigint, @Body() dto: VideoGenerateDto) {
    return this.videosService.generate(userId, dto);
  }

  @Get('tasks')
  tasks(@CurrentUser('id') userId: bigint, @Query() pagination: PaginationDto, @Query('status') status?: string) {
    return this.videosService.listTasks(userId, pagination, status);
  }

  @Get('tasks/:id')
  taskDetail(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.videosService.getTask(userId, id);
  }

  @Delete('tasks/:id')
  deleteTask(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.videosService.deleteTask(userId, BigInt(id));
  }

  @Post('tasks/:id/cancel')
  cancelTask(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.videosService.cancel(userId, id);
  }

  @Post('tasks/:id/retry')
  retry(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.videosService.retry(userId, BigInt(id));
  }
}
