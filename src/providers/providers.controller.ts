import { Controller, Get, Param } from '@nestjs/common';

import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  list() {
    return this.providersService.list();
  }

  @Get(':provider')
  detail(@Param('provider') provider: string) {
    return this.providersService.detail(provider);
  }
}

