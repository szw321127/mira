import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminProjectsController } from './admin-projects.controller';
import { AdminProjectsService } from './admin-projects.service';

@Module({
  controllers: [AdminProjectsController],
  imports: [PrismaModule],
  providers: [AdminProjectsService],
})
export class AdminProjectsModule {}
