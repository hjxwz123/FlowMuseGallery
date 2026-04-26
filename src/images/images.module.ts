import { Module } from '@nestjs/common';

import { LocalRunnerModule } from '../local-runner/local-runner.module';
import { ProjectsModule } from '../projects/projects.module';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

@Module({
  imports: [LocalRunnerModule, ProjectsModule],
  controllers: [ImagesController],
  providers: [ImagesService],
  exports: [ImagesService],
})
export class ImagesModule {}
