import { BadRequestException, Injectable } from '@nestjs/common';
import {
  analyzeXhsAccount,
  analyzeXhsPost,
  buildXhsCommercialWorkflow,
  buildXhsOutlineCandidates,
  normalizeXhsImportedAccount,
  normalizeXhsImportedPosts,
} from '@rednote/agent/dist/index.js';
import type {
  XhsAccountInput,
  XhsImportedAccountNormalization,
  XhsImportedPostsNormalization,
  XhsCommercialWorkflowInput,
  XhsOutlineCandidateInput,
  XhsPostAnalysis,
  XhsPostInput,
} from '@rednote/agent';
import { AdminContentProvidersService } from '../admin-content-providers/admin-content-providers.service';
import type { AdminContentProviderType } from '../admin-content-providers/admin-content-providers.types';
import {
  createProviderEndpoint,
  isRecord,
  postProviderJson,
} from '../model-provider/openai-compatible';

type ImportXhsPostInput = {
  noteId?: string;
  providerType?: AdminContentProviderType;
  url?: string;
};

type ImportXhsAccountInput = {
  limit?: number;
  providerType?: AdminContentProviderType;
  url?: string;
  userId?: string;
};

type XhsProviderImportSummary = {
  complianceNote: string;
  endpoint: string;
  rateLimitPerMinute: number | null;
  sourceId: string;
  type: AdminContentProviderType;
};

export type ImportedXhsPostAnalysis = {
  analysis: XhsPostAnalysis;
  imported: XhsImportedPostsNormalization;
  provider: XhsProviderImportSummary;
};

export type ImportedXhsAccountAnalysis = {
  analysis: ReturnType<typeof analyzeXhsAccount>;
  imported: XhsImportedAccountNormalization;
  provider: XhsProviderImportSummary;
};

@Injectable()
export class XhsAnalysisService {
  constructor(
    private readonly contentProviders: AdminContentProvidersService,
  ) {}

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

  async importAndAnalyzePost(
    input: ImportXhsPostInput,
  ): Promise<ImportedXhsPostAnalysis> {
    const normalizedInput = this.normalizePostImportInput(input);
    const providerType = normalizedInput.providerType ?? 'tikhub';
    const runtimeConfig =
      await this.contentProviders.getRuntimeConfig(providerType);
    const endpoint = createProviderEndpoint(
      runtimeConfig.baseUrl,
      'xhs/posts/import',
    );
    const payload = await postProviderJson(endpoint, runtimeConfig.apiKey, {
      noteId: normalizedInput.noteId,
      url: normalizedInput.url,
    });
    const raw = this.extractProviderRecord(payload, ['note', 'post', 'item']);
    const sourceId =
      normalizedInput.noteId ?? normalizedInput.url ?? 'unknown-post';
    const imported = normalizeXhsImportedPosts([
      {
        raw,
        source: 'provider',
        sourceId,
      },
    ]);
    const post = imported.posts[0];

    if (!post) {
      throw new BadRequestException('内容来源没有返回可分析的帖子。');
    }

    return {
      analysis: analyzeXhsPost(post),
      imported,
      provider: {
        complianceNote: runtimeConfig.complianceNote,
        endpoint,
        rateLimitPerMinute: runtimeConfig.rateLimitPerMinute,
        sourceId,
        type: runtimeConfig.type,
      },
    };
  }

  async importAndAnalyzeAccount(
    input: ImportXhsAccountInput,
  ): Promise<ImportedXhsAccountAnalysis> {
    const normalizedInput = this.normalizeAccountImportInput(input);
    const providerType = normalizedInput.providerType ?? 'tikhub';
    const runtimeConfig =
      await this.contentProviders.getRuntimeConfig(providerType);
    const endpoint = createProviderEndpoint(
      runtimeConfig.baseUrl,
      'xhs/accounts/import',
    );
    const payload = await postProviderJson(endpoint, runtimeConfig.apiKey, {
      limit: normalizedInput.limit,
      url: normalizedInput.url,
      userId: normalizedInput.userId,
    });
    const raw = this.extractProviderRecord(payload, [
      'account',
      'profile',
      'user',
    ]);
    const sourceId =
      normalizedInput.userId ?? normalizedInput.url ?? 'unknown-account';
    const imported = normalizeXhsImportedAccount({
      raw,
      source: 'provider',
      sourceId,
    });

    return {
      analysis: analyzeXhsAccount(imported.account),
      imported,
      provider: {
        complianceNote: runtimeConfig.complianceNote,
        endpoint,
        rateLimitPerMinute: runtimeConfig.rateLimitPerMinute,
        sourceId,
        type: runtimeConfig.type,
      },
    };
  }

  private normalizePostImportInput(
    input: ImportXhsPostInput,
  ): Required<Pick<ImportXhsPostInput, 'providerType'>> &
    Pick<ImportXhsPostInput, 'noteId' | 'url'> {
    const noteId = input.noteId?.trim();
    const url = input.url?.trim();

    if (!noteId && !url) {
      throw new BadRequestException('请提供小红书帖子 URL 或 noteId。');
    }

    return {
      noteId,
      providerType: input.providerType ?? 'tikhub',
      url,
    };
  }

  private normalizeAccountImportInput(
    input: ImportXhsAccountInput,
  ): Required<Pick<ImportXhsAccountInput, 'providerType'>> &
    Pick<ImportXhsAccountInput, 'limit' | 'url' | 'userId'> {
    const userId = input.userId?.trim();
    const url = input.url?.trim();

    if (!userId && !url) {
      throw new BadRequestException('请提供小红书账号 URL 或 userId。');
    }

    return {
      limit: input.limit,
      providerType: input.providerType ?? 'tikhub',
      url,
      userId,
    };
  }

  private extractProviderRecord(
    payload: unknown,
    preferredKeys: string[],
  ): Record<string, unknown> {
    const data = this.unwrapProviderEnvelope(payload);

    if (Array.isArray(data)) {
      const first: unknown = data[0];

      if (isRecord(first)) {
        return first;
      }
    }

    if (!isRecord(data)) {
      throw new BadRequestException('内容来源响应格式无效。');
    }

    for (const key of preferredKeys) {
      const nested: unknown = data[key];

      if (isRecord(nested)) {
        return nested;
      }
    }

    return data;
  }

  private unwrapProviderEnvelope(payload: unknown): unknown {
    if (!isRecord(payload)) {
      return payload;
    }

    if ('data' in payload) {
      return this.unwrapProviderEnvelope(payload.data);
    }

    if ('result' in payload) {
      return this.unwrapProviderEnvelope(payload.result);
    }

    return payload;
  }
}
