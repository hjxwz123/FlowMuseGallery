import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateConfigDto } from './dto/update-config.dto';
import { AdminConfigsService } from './admin-configs.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/configs')
export class AdminConfigsController {
  constructor(private readonly configsService: AdminConfigsService) {}

  @Get()
  list() {
    return this.configsService.list();
  }

  @Put(':key')
  update(@Param('key') key: string, @Body() dto: UpdateConfigDto) {
    return this.configsService.update(key, dto);
  }
}

