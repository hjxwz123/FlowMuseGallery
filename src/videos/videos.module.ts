import { Module } from '@nestjs/common';

import { LocalRunnerModule } from '../local-runner/local-runner.module';
import { ProjectsModule } from '../projects/projects.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [LocalRunnerModule, ProjectsModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
