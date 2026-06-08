import { Module } from '@nestjs/common';
import { AdminModelConfigsModule } from '../admin-model-configs/admin-model-configs.module';
import { GenerationService } from './generation.service';

@Module({
  exports: [GenerationService],
  imports: [AdminModelConfigsModule],
  providers: [GenerationService],
})
export class GenerationModule {}
