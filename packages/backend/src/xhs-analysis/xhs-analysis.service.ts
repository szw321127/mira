import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  analyzeXhsAccount,
  analyzeXhsPost,
  auditXhsImageTextPublishPackage,
  buildXhsCommercialWorkflow,
  buildXhsGenerationBrief,
  buildXhsOutlineCandidates,
  normalizeXhsImportedAccount,
  normalizeXhsImportedPosts,
} from './domain';
import type {
  XhsAccountInput,
  XhsGenerationBriefInput,
  XhsCommercialWorkflowInput,
  XhsOutlineCandidateInput,
  XhsPostInput,
} from './domain';
import { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import { AdminContentProvidersService } from '../admin-content-providers/admin-content-providers.service';
import {
  createProviderEndpoint,
  postProviderJson,
} from '../model-provider/openai-compatible';
import { PrismaService } from '../prisma/prisma.service';
import {
  requestTextJson,
  requireText,
  toRepairedPublishPackage,
  toRepairResult,
} from './xhs-publish-repair.utils';
import {
  extractProviderRecord,
  normalizeAccountImportInput,
  normalizePostImportInput,
} from './xhs-provider-import.utils';
import type {
  ImportedXhsAccountAnalysis,
  ImportedXhsPostAnalysis,
  ImportXhsAccountInput,
  ImportXhsPostInput,
  RepairedXhsPublishPackage,
  RepairXhsPublishPackageInput,
  SavedXhsReference,
  BuildXhsResearchOutlinesInput,
  XhsResearchOutlinesResult,
  XhsProviderImportSummary,
  XhsReferenceKind,
  XhsStoredReference,
} from './xhs-analysis.types';
import { XhsResearchOutlinesService } from './xhs-research-outlines.service';

@Injectable()
export class XhsAnalysisService {
  constructor(
    private readonly contentProviders: AdminContentProvidersService,
    private readonly prisma: PrismaService,
    private readonly modelConfigs: AdminModelConfigsService,
    private readonly researchOutlines: XhsResearchOutlinesService,
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

  async buildResearchOutlines(
    input: BuildXhsResearchOutlinesInput,
    userId: string,
  ): Promise<XhsResearchOutlinesResult> {
    return this.researchOutlines.buildResearchOutlines(input, userId);
  }

  async repairPublishPackage(
    input: RepairXhsPublishPackageInput,
  ): Promise<RepairedXhsPublishPackage> {
    const currentAudit = auditXhsImageTextPublishPackage(input.publishPackage);

    if (currentAudit.ready) {
      return toRepairResult(input.publishPackage, currentAudit, false);
    }

    const payload = await requestTextJson(this.modelConfigs, [
      {
        content:
          '你是小红书图文发布包质检编辑。只返回 JSON，不要 Markdown，不要解释。',
        role: 'system',
      },
      {
        content: [
          `用户想法：${requireText(input.idea, '创作想法')}`,
          `当前发布包：${JSON.stringify(input.publishPackage)}`,
          `审核阻塞项：${JSON.stringify(currentAudit.blockers)}`,
          `审核警告：${JSON.stringify(currentAudit.warnings)}`,
          `修复动作：${JSON.stringify(input.repairActions ?? currentAudit.repairActions)}`,
          '请返回完整 JSON：{"publishPackage":{...}}。',
          'publishPackage 必须包含 titleCandidates、pages、caption、hashtags、imagePromptPack。',
          'pages 保持 4 到 7 页，每页包含 pageNumber、role、headline、body、imagePrompt、designNotes。',
          '结果必须是用户可直接复制发布的小红书图文内容，不要返回创作建议或提示词说明。',
        ].join('\n'),
        role: 'user',
      },
    ]);
    const repairedPackage = toRepairedPublishPackage(
      payload,
      input.publishPackage,
    );
    const repairedAudit = auditXhsImageTextPublishPackage(repairedPackage);

    return toRepairResult(repairedPackage, repairedAudit, true);
  }

  async listReferences(
    userId: string,
    conversationId: string,
  ): Promise<XhsStoredReference[]> {
    await this.ensureOwnedConversation(userId, conversationId);

    const references = await this.prisma.xhsReference.findMany({
      orderBy: { createdAt: 'desc' },
      where: { conversationId },
    });

    return references.map((reference) => ({
      analysis: this.parseStoredReferenceJson(reference.analysis),
      conversationId: reference.conversationId,
      createdAt: reference.createdAt,
      id: reference.id,
      imported: this.parseStoredReferenceJson(reference.imported),
      kind: reference.kind as XhsReferenceKind,
      providerEndpoint: reference.providerEndpoint,
      providerType: reference.providerType,
      reference: {
        conversationId: reference.conversationId,
        createdAt: reference.createdAt,
        id: reference.id,
        kind: reference.kind as XhsReferenceKind,
        sourceId: reference.sourceId,
        title: reference.title,
      },
      sourceId: reference.sourceId,
      sourceUrl: reference.sourceUrl,
      title: reference.title,
      updatedAt: reference.updatedAt,
    }));
  }

  async deleteReference(userId: string, referenceId: string) {
    const reference = await this.prisma.xhsReference.findFirst({
      select: {
        conversation: { select: { userId: true } },
        id: true,
      },
      where: { id: referenceId },
    });

    if (!reference || reference.conversation.userId !== userId) {
      throw new NotFoundException('参考来源不存在或无权删除。');
    }

    await this.prisma.xhsReference.delete({ where: { id: referenceId } });

    return { ok: true };
  }

  async importAndAnalyzePost(
    input: ImportXhsPostInput,
    userId?: string,
  ): Promise<ImportedXhsPostAnalysis> {
    const normalizedInput = normalizePostImportInput(input);
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
    const raw = extractProviderRecord(payload, ['note', 'post', 'item']);
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
    const normalizedInput = normalizeAccountImportInput(input);
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
    const raw = extractProviderRecord(payload, ['account', 'profile', 'user']);
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

    await this.ensureOwnedConversation(input.userId, input.conversationId);

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

  private async ensureOwnedConversation(
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      select: { id: true },
      where: { id: conversationId, userId },
    });

    if (!conversation) {
      throw new NotFoundException('对话不存在或无权保存参考来源。');
    }

    return conversation;
  }

  private parseStoredReferenceJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException('参考来源数据损坏，请重新导入。');
    }
  }
}
