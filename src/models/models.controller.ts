import { Controller, Get, Param, Query } from '@nestjs/common';

import { ModelsService } from './models.service';

@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  list(@Query('type') type?: 'image' | 'video' | 'chat', @Query('provider') provider?: string) {
    return this.modelsService.list({ type, provider });
  }

  @Get('capabilities')
  listCapabilities(@Query('type') type?: 'image' | 'video' | 'chat', @Query('provider') provider?: string) {
    return this.modelsService.listCapabilities({ type, provider });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.modelsService.detail(BigInt(id));
  }

  @Get(':id/capabilities')
  capabilities(@Param('id') id: string) {
    return this.modelsService.capabilities(BigInt(id));
  }
}
