import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyzeXhsAccountDto } from './dto/analyze-xhs-account.dto';
import { AnalyzeXhsPostDto } from './dto/analyze-xhs-post.dto';
import { BuildXhsCommercialWorkflowDto } from './dto/build-xhs-commercial-workflow.dto';
import { BuildXhsGenerationBriefDto } from './dto/build-xhs-generation-brief.dto';
import { BuildXhsOutlineCandidatesDto } from './dto/build-xhs-outline-candidates.dto';
import { ImportXhsAccountDto } from './dto/import-xhs-account.dto';
import { ImportXhsPostDto } from './dto/import-xhs-post.dto';
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
  importPost(@Body() dto: ImportXhsPostDto) {
    return this.xhsAnalysisService.importAndAnalyzePost(dto);
  }

  @Post('accounts/analyze')
  analyzeAccount(@Body() dto: AnalyzeXhsAccountDto) {
    return this.xhsAnalysisService.analyzeAccount(dto);
  }

  @Post('accounts/import')
  importAccount(@Body() dto: ImportXhsAccountDto) {
    return this.xhsAnalysisService.importAndAnalyzeAccount(dto);
  }

  @Post('generation-brief')
  buildGenerationBrief(@Body() dto: BuildXhsGenerationBriefDto) {
    return this.xhsAnalysisService.buildGenerationBrief(dto);
  }

  @Post('outlines')
  buildOutlineCandidates(@Body() dto: BuildXhsOutlineCandidatesDto) {
    return this.xhsAnalysisService.buildOutlineCandidates(dto);
  }

  @Post('workflows/commercial-draft')
  buildCommercialWorkflow(@Body() dto: BuildXhsCommercialWorkflowDto) {
    return this.xhsAnalysisService.buildCommercialWorkflow(dto);
  }
}
