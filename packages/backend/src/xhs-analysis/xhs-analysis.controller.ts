import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AnalyzeXhsAccountDto } from './dto/analyze-xhs-account.dto';
import { AnalyzeXhsPostDto } from './dto/analyze-xhs-post.dto';
import { BuildXhsCommercialWorkflowDto } from './dto/build-xhs-commercial-workflow.dto';
import { BuildXhsGenerationBriefDto } from './dto/build-xhs-generation-brief.dto';
import { BuildXhsResearchOutlinesDto } from './dto/build-xhs-research-outlines.dto';
import { BuildXhsOutlineCandidatesDto } from './dto/build-xhs-outline-candidates.dto';
import { ImportXhsAccountDto } from './dto/import-xhs-account.dto';
import { ImportXhsPostDto } from './dto/import-xhs-post.dto';
import { RepairXhsPublishPackageDto } from './dto/repair-xhs-publish-package.dto';
import { XhsAnalysisService } from './xhs-analysis.service';

@Controller('xhs-analysis')
@UseGuards(JwtAuthGuard)
export class XhsAnalysisController {
  constructor(private readonly xhsAnalysisService: XhsAnalysisService) {}

  @Post('posts/analyze')
  analyzePost(@Body() dto: AnalyzeXhsPostDto) {
    return this.xhsAnalysisService.analyzePost(dto);
  }

  @Post('posts/import')
  importPost(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportXhsPostDto,
  ) {
    return this.xhsAnalysisService.importAndAnalyzePost(dto, user.id);
  }

  @Post('accounts/analyze')
  analyzeAccount(@Body() dto: AnalyzeXhsAccountDto) {
    return this.xhsAnalysisService.analyzeAccount(dto);
  }

  @Post('accounts/import')
  importAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportXhsAccountDto,
  ) {
    return this.xhsAnalysisService.importAndAnalyzeAccount(dto, user.id);
  }

  @Post('generation-brief')
  buildGenerationBrief(@Body() dto: BuildXhsGenerationBriefDto) {
    return this.xhsAnalysisService.buildGenerationBrief(dto);
  }

  @Post('outlines')
  buildOutlineCandidates(@Body() dto: BuildXhsOutlineCandidatesDto) {
    return this.xhsAnalysisService.buildOutlineCandidates(dto);
  }

  @Post('research/outlines')
  buildResearchOutlines(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BuildXhsResearchOutlinesDto,
  ) {
    return this.xhsAnalysisService.buildResearchOutlines(dto, user.id);
  }

  @Post('workflows/commercial-draft')
  buildCommercialWorkflow(@Body() dto: BuildXhsCommercialWorkflowDto) {
    return this.xhsAnalysisService.buildCommercialWorkflow(dto);
  }

  @Post('workflows/repair-publish-package')
  repairPublishPackage(@Body() dto: RepairXhsPublishPackageDto) {
    return this.xhsAnalysisService.repairPublishPackage(dto);
  }
}
