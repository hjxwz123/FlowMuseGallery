import { Module } from '@nestjs/common';

import { DefaultModelProvidersService } from './default-model-providers';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, DefaultModelProvidersService],
})
export class ProvidersModule {}
