import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ImageGenerateDto } from './dto/image-generate.dto';
import { MidjourneyActionDto } from './dto/midjourney-action.dto';
import { MidjourneyModalDto } from './dto/midjourney-modal.dto';
import { MidjourneyEditsDto } from './dto/midjourney-edits.dto';
import { ImagesService } from './images.service';

@UseGuards(JwtAuthGuard)
@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('generate')
  generate(@CurrentUser('id') userId: bigint, @Body() dto: ImageGenerateDto) {
    return this.imagesService.generate(userId, dto);
  }

  @Get('tasks')
  tasks(@CurrentUser('id') userId: bigint, @Query() pagination: PaginationDto, @Query('status') status?: string) {
    return this.imagesService.listTasks(userId, pagination, status);
  }

  @Get('tasks/:id')
  taskDetail(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.imagesService.getTask(userId, id);
  }

  @Delete('tasks/:id')
  deleteTask(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.imagesService.deleteTask(userId, BigInt(id));
  }

  @Post('tasks/:id/retry')
  retry(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.imagesService.retry(userId, BigInt(id));
  }

  @Post('tasks/:id/midjourney/action')
  midjourneyAction(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: MidjourneyActionDto) {
    return this.imagesService.midjourneyAction(userId, BigInt(id), dto);
  }

  @Post('tasks/:id/midjourney/modal')
  midjourneyModal(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: MidjourneyModalDto) {
    return this.imagesService.midjourneyModal(userId, BigInt(id), dto);
  }

  @Post('tasks/:id/midjourney/edits')
  midjourneyEdits(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: MidjourneyEditsDto) {
    return this.imagesService.midjourneyEdits(userId, BigInt(id), dto);
  }
}
