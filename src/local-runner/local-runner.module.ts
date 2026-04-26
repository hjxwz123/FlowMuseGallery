import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { LocalTaskRunnerService } from './local-task-runner.service';

@Module({
  imports: [ProjectsModule],
  providers: [LocalTaskRunnerService],
  exports: [LocalTaskRunnerService],
})
export class LocalRunnerModule {}
