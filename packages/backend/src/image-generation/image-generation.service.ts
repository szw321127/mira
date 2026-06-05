import { Injectable } from '@nestjs/common';
import { MockImageProvider } from './mock-image.provider';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from './image-generation.types';

@Injectable()
export class ImageGenerationService {
  constructor(private readonly provider: MockImageProvider) {}

  generateCover(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    return this.provider.generate(input);
  }
}
