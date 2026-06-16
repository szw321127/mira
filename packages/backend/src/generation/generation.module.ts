import { Module } from '@nestjs/common';
import { ModelProviderModule } from '../model-provider/model-provider.module';
import { GenerationService } from './generation.service';

@Module({
  exports: [GenerationService],
  imports: [ModelProviderModule],
  providers: [GenerationService],
})
export class GenerationModule {}
