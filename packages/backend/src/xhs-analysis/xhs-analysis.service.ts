import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  analyzeXhsAccount,
  analyzeXhsPost,
  buildXhsCommercialWorkflow,
  buildXhsGenerationBrief,
  buildXhsOutlineCandidates,
  normalizeXhsImportedAccount,
  normalizeXhsImportedPosts,
} from '@rednote/agent/dist/index.js';
import type {
  XhsAccountInput,
  XhsGenerationBriefInput,
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
import { PrismaService } from '../prisma/prisma.service';

type ImportXhsPostInput = {
  conversationId?: string;
  noteId?: string;
  providerType?: AdminContentProviderType;
  url?: string;
};

type ImportXhsAccountInput = {
  conversationId?: string;
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

type XhsReferenceKind = 'account' | 'post';

type SavedXhsReference = {
  conversationId: string;
  createdAt: Date;
  id: string;
  kind: XhsReferenceKind;
  sourceId: string;
  title: string;
};

export type ImportedXhsPostAnalysis = {
  analysis: XhsPostAnalysis;
  imported: XhsImportedPostsNormalization;
  provider: XhsProviderImportSummary;
  reference?: SavedXhsReference;
};

export type ImportedXhsAccountAnalysis = {
  analysis: ReturnType<typeof analyzeXhsAccount>;
  imported: XhsImportedAccountNormalization;
  provider: XhsProviderImportSummary;
  reference?: SavedXhsReference;
};

@Injectable()
export class XhsAnalysisService {
  constructor(
    private readonly contentProviders: AdminContentProvidersService,
    private readonly prisma: PrismaService,
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

  buildGenerationBrief(input: XhsGenerationBriefInput) {
    return buildXhsGenerationBrief(input);
  }

  buildCommercialWorkflow(input: XhsCommercialWorkflowInput) {
    return buildXhsCommercialWorkflow(input);
  }

  async importAndAnalyzePost(
    input: ImportXhsPostInput,
    userId?: string,
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
    const analysis = analyzeXhsPost(post);
    const provider = {
      complianceNote: runtimeConfig.complianceNote,
      endpoint,
      rateLimitPerMinute: runtimeConfig.rateLimitPerMinute,
      sourceId,
      type: runtimeConfig.type,
    };
    const reference = await this.persistImportedReference({
      analysis,
      conversationId: normalizedInput.conversationId,
      imported,
      kind: 'post',
      provider,
      sourceId: imported.sources[0]?.normalizedId ?? sourceId,
      sourceUrl: imported.sources[0]?.url ?? post.url ?? normalizedInput.url,
      title: post.title,
      userId,
    });

    return {
      analysis,
      imported,
      provider,
      ...(reference ? { reference } : {}),
    };
  }

  async importAndAnalyzeAccount(
    input: ImportXhsAccountInput,
    userId?: string,
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
    const analysis = analyzeXhsAccount(imported.account);
    const provider = {
      complianceNote: runtimeConfig.complianceNote,
      endpoint,
      rateLimitPerMinute: runtimeConfig.rateLimitPerMinute,
      sourceId,
      type: runtimeConfig.type,
    };
    const reference = await this.persistImportedReference({
      analysis,
      conversationId: normalizedInput.conversationId,
      imported,
      kind: 'account',
      provider,
      sourceId: imported.source.normalizedId,
      sourceUrl:
        imported.source.url ?? imported.account.url ?? normalizedInput.url,
      title: imported.account.name || imported.source.normalizedId,
      userId,
    });

    return {
      analysis,
      imported,
      provider,
      ...(reference ? { reference } : {}),
    };
  }

  private normalizePostImportInput(
    input: ImportXhsPostInput,
  ): Required<Pick<ImportXhsPostInput, 'providerType'>> &
    Pick<ImportXhsPostInput, 'conversationId' | 'noteId' | 'url'> {
    const conversationId = input.conversationId?.trim();
    const noteId = input.noteId?.trim();
    const url = input.url?.trim();

    if (!noteId && !url) {
      throw new BadRequestException('请提供小红书帖子 URL 或 noteId。');
    }

    return {
      conversationId,
      noteId,
      providerType: input.providerType ?? 'tikhub',
      url,
    };
  }

  private normalizeAccountImportInput(
    input: ImportXhsAccountInput,
  ): Required<Pick<ImportXhsAccountInput, 'providerType'>> &
    Pick<ImportXhsAccountInput, 'conversationId' | 'limit' | 'url' | 'userId'> {
    const conversationId = input.conversationId?.trim();
    const userId = input.userId?.trim();
    const url = input.url?.trim();

    if (!userId && !url) {
      throw new BadRequestException('请提供小红书账号 URL 或 userId。');
    }

    return {
      conversationId,
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

  private async persistImportedReference(input: {
    analysis: unknown;
    conversationId?: string;
    imported: unknown;
    kind: XhsReferenceKind;
    provider: XhsProviderImportSummary;
    sourceId: string;
    sourceUrl?: string;
    title: string;
    userId?: string;
  }): Promise<SavedXhsReference | undefined> {
    if (!input.conversationId) return undefined;

    if (!input.userId) {
      throw new BadRequestException('保存参考来源需要登录用户。');
    }

    const conversation = await this.prisma.conversation.findFirst({
      select: { id: true },
      where: { id: input.conversationId, userId: input.userId },
    });

    if (!conversation) {
      throw new NotFoundException('对话不存在或无权保存参考来源。');
    }

    const reference = await this.prisma.xhsReference.upsert({
      create: {
        analysis: JSON.stringify(input.analysis),
        conversationId: input.conversationId,
        imported: JSON.stringify(input.imported),
        kind: input.kind,
        providerEndpoint: input.provider.endpoint,
        providerType: input.provider.type,
        sourceId: input.sourceId,
        sourceUrl: input.sourceUrl,
        title: input.title,
      },
      update: {
        analysis: JSON.stringify(input.analysis),
        imported: JSON.stringify(input.imported),
        providerEndpoint: input.provider.endpoint,
        providerType: input.provider.type,
        sourceUrl: input.sourceUrl,
        title: input.title,
      },
      where: {
        conversationId_kind_sourceId: {
          conversationId: input.conversationId,
          kind: input.kind,
          sourceId: input.sourceId,
        },
      },
    });

    return {
      conversationId: reference.conversationId,
      createdAt: reference.createdAt,
      id: reference.id,
      kind: reference.kind as XhsReferenceKind,
      sourceId: reference.sourceId,
      title: reference.title,
    };
  }
}
