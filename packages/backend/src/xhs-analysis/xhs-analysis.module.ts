import { Module } from '@nestjs/common';
import { AdminContentProvidersModule } from '../admin-content-providers/admin-content-providers.module';
import { AuthModule } from '../auth/auth.module';
import { ModelProviderModule } from '../model-provider/model-provider.module';
import { PrismaModule } from '../prisma/prisma.module';
import { XhsAuthorizationsModule } from '../xhs-authorizations/xhs-authorizations.module';
import { XhsConnectorModule } from '../xhs-connector/xhs-connector.module';
import { XhsAnalysisController } from './xhs-analysis.controller';
import { XhsAnalysisService } from './xhs-analysis.service';
import { XhsReferencesController } from './xhs-references.controller';
import { XhsResearchAiService } from './xhs-research-ai.service';
import { XhsResearchOutlinesService } from './xhs-research-outlines.service';

@Module({
  controllers: [XhsAnalysisController, XhsReferencesController],
  exports: [XhsAnalysisService],
  imports: [
    AdminContentProvidersModule,
    AuthModule,
    ModelProviderModule,
    PrismaModule,
    XhsAuthorizationsModule,
    XhsConnectorModule,
  ],
  providers: [
    XhsAnalysisService,
    XhsResearchAiService,
    XhsResearchOutlinesService,
  ],
})
export class XhsAnalysisModule {}
