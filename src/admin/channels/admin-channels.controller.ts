import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AdminChannelsService } from './admin-channels.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/channels')
export class AdminChannelsController {
  constructor(private readonly channelsService: AdminChannelsService) {}

  @Get()
  list() {
    return this.channelsService.list();
  }

  @Post()
  create(@Body() dto: CreateChannelDto) {
    return this.channelsService.create(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.channelsService.detail(BigInt(id));
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.channelsService.update(BigInt(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.channelsService.remove(BigInt(id));
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.channelsService.test(BigInt(id));
  }

  @Get(':id/statistics')
  statistics(@Param('id') id: string) {
    return this.channelsService.statistics(BigInt(id));
  }
}

