import { Module } from '@nestjs/common';
import { AdminModelConfigsModule } from '../admin-model-configs/admin-model-configs.module';
import { ImageGenerationService } from './image-generation.service';

@Module({
  exports: [ImageGenerationService],
  imports: [AdminModelConfigsModule],
  providers: [ImageGenerationService],
})
export class ImageGenerationModule {}
