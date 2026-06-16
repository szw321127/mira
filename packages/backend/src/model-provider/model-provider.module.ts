import { Module } from '@nestjs/common';
import { AdminModelConfigsModule } from '../admin-model-configs/admin-model-configs.module';
import { AiTextModelService } from './ai-text-model.service';

@Module({
  exports: [AiTextModelService],
  imports: [AdminModelConfigsModule],
  providers: [AiTextModelService],
})
export class ModelProviderModule {}
