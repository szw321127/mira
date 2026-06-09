import { Injectable } from '@nestjs/common';
import {
  analyzeXhsAccount,
  analyzeXhsPost,
  buildXhsCommercialWorkflow,
  buildXhsOutlineCandidates,
} from '@rednote/agent/dist/index.js';
import type {
  XhsAccountInput,
  XhsCommercialWorkflowInput,
  XhsOutlineCandidateInput,
  XhsPostInput,
} from '@rednote/agent';

@Injectable()
export class XhsAnalysisService {
  analyzePost(input: XhsPostInput) {
    return analyzeXhsPost(input);
  }

  analyzeAccount(input: XhsAccountInput) {
    return analyzeXhsAccount(input);
  }

  buildOutlineCandidates(input: XhsOutlineCandidateInput) {
    return buildXhsOutlineCandidates(input);
  }

  buildCommercialWorkflow(input: XhsCommercialWorkflowInput) {
    return buildXhsCommercialWorkflow(input);
  }
}
