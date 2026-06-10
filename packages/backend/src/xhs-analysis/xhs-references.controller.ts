import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { XhsAnalysisService } from './xhs-analysis.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class XhsReferencesController {
  constructor(private readonly xhsAnalysisService: XhsAnalysisService) {}

  @Get('conversations/:conversationId/xhs-references')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.xhsAnalysisService.listReferences(user.id, conversationId);
  }

  @Delete('xhs-references/:referenceId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('referenceId') referenceId: string,
  ) {
    return this.xhsAnalysisService.deleteReference(user.id, referenceId);
  }
}
