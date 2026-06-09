import { Module } from '@nestjs/common';
import { AdminContentProvidersModule } from '../admin-content-providers/admin-content-providers.module';
import { AuthModule } from '../auth/auth.module';
import { XhsAnalysisController } from './xhs-analysis.controller';
import { XhsAnalysisService } from './xhs-analysis.service';

@Module({
  controllers: [XhsAnalysisController],
  exports: [XhsAnalysisService],
  imports: [AdminContentProvidersModule, AuthModule],
  providers: [XhsAnalysisService],
})
export class XhsAnalysisModule {}
