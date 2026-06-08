import { Module } from '@nestjs/common';
import { AdminProjectsController } from './admin-projects.controller';
import { AdminProjectsService } from './admin-projects.service';

@Module({
  controllers: [AdminProjectsController],
  providers: [AdminProjectsService],
})
export class AdminProjectsModule {}
