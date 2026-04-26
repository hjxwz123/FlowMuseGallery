import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminProvidersService } from './admin-providers.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly providersService: AdminProvidersService) {}

  @Get()
  list() {
    return this.providersService.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.providersService.detail(BigInt(id));
  }
}
