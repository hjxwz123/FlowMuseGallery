import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QueryTaskFeedDto } from './dto/query-task-feed.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('feed')
  listFeed(@CurrentUser('id') userId: bigint, @Query() query: QueryTaskFeedDto) {
    return this.tasksService.listFeed(userId, query);
  }
}
