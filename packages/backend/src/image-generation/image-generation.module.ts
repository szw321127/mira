import { Module } from '@nestjs/common';
import { ImageGenerationService } from './image-generation.service';
import { MockImageProvider } from './mock-image.provider';

@Module({
  exports: [ImageGenerationService],
  providers: [ImageGenerationService, MockImageProvider],
})
export class ImageGenerationModule {}
