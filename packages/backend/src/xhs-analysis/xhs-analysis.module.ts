import { Module } from '@nestjs/common';
import { AdminContentProvidersModule } from '../admin-content-providers/admin-content-providers.module';
import { AdminModelConfigsModule } from '../admin-model-configs/admin-model-configs.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { XhsAnalysisController } from './xhs-analysis.controller';
import { XhsAnalysisService } from './xhs-analysis.service';
import { XhsReferencesController } from './xhs-references.controller';

@Module({
  controllers: [XhsAnalysisController, XhsReferencesController],
  exports: [XhsAnalysisService],
  imports: [
    AdminContentProvidersModule,
    AdminModelConfigsModule,
    AuthModule,
    PrismaModule,
  ],
  providers: [XhsAnalysisService],
})
export class XhsAnalysisModule {}
