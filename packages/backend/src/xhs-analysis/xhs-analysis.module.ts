import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { XhsAnalysisController } from './xhs-analysis.controller';
import { XhsAnalysisService } from './xhs-analysis.service';

@Module({
  controllers: [XhsAnalysisController],
  exports: [XhsAnalysisService],
  imports: [AuthModule],
  providers: [XhsAnalysisService],
})
export class XhsAnalysisModule {}
