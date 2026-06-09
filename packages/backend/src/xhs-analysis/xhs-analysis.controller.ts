import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyzeXhsAccountDto } from './dto/analyze-xhs-account.dto';
import { AnalyzeXhsPostDto } from './dto/analyze-xhs-post.dto';
import { BuildXhsCommercialWorkflowDto } from './dto/build-xhs-commercial-workflow.dto';
import { BuildXhsOutlineCandidatesDto } from './dto/build-xhs-outline-candidates.dto';
import { XhsAnalysisService } from './xhs-analysis.service';

@Controller('xhs-analysis')
@UseGuards(JwtAuthGuard)
export class XhsAnalysisController {
  constructor(private readonly xhsAnalysisService: XhsAnalysisService) {}

  @Post('posts/analyze')
  analyzePost(@Body() dto: AnalyzeXhsPostDto) {
    return this.xhsAnalysisService.analyzePost(dto);
  }

  @Post('accounts/analyze')
  analyzeAccount(@Body() dto: AnalyzeXhsAccountDto) {
    return this.xhsAnalysisService.analyzeAccount(dto);
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
