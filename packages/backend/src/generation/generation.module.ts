import { Module } from '@nestjs/common';
import { GenerationService } from './generation.service';

@Module({
  exports: [GenerationService],
  providers: [GenerationService],
})
export class GenerationModule {}
