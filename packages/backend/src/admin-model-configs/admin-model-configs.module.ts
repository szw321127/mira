import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModelConfigsController } from './admin-model-configs.controller';
import { AdminModelConfigsService } from './admin-model-configs.service';

@Module({
  controllers: [AdminModelConfigsController],
  exports: [AdminModelConfigsService],
  imports: [PrismaModule],
  providers: [AdminModelConfigsService],
})
export class AdminModelConfigsModule {}
