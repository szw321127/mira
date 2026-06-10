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
} from '@rednote/agent/dist/index.js';
import type {
  XhsAccountInput,
  XhsGenerationBriefInput,
  XhsImageTextPage,
  XhsImageTextPublishPackage,
  XhsImportedAccountNormalization,
  XhsImportedPostsNormalization,
  XhsCommercialWorkflowInput,
  XhsOutlineCandidateInput,
  XhsPostAnalysis,
  XhsPostInput,
  XhsPublishPackageAudit,
} from '@rednote/agent';
import { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import { AdminContentProvidersService } from '../admin-content-providers/admin-content-providers.service';
import type { AdminContentProviderType } from '../admin-content-providers/admin-content-providers.types';
import {
  createProviderEndpoint,
  extractChatContent,
  isRecord,
  parseProviderJsonObject,
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

type RepairXhsPublishPackageInput = {
  idea: string;
  publishPackage: XhsImageTextPublishPackage;
  repairActions?: string[];
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

export type XhsStoredReference = {
  analysis: unknown;
  conversationId: string;
  createdAt: Date;
  id: string;
  imported: unknown;
  kind: XhsReferenceKind;
  providerEndpoint: string | null;
  providerType: string;
  reference: SavedXhsReference;
  sourceId: string;
  sourceUrl: string | null;
  title: string;
  updatedAt: Date;
};

export type RepairedXhsPublishPackage = {
  audit: XhsPublishPackageAudit;
  publishPackage: XhsImageTextPublishPackage;
  repaired: boolean;
  summary: {
    ready: boolean;
    repairActionCount: number;
    score: number;
  };
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
    private readonly modelConfigs: AdminModelConfigsService,
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

  async repairPublishPackage(
    input: RepairXhsPublishPackageInput,
  ): Promise<RepairedXhsPublishPackage> {
    const currentAudit = auditXhsImageTextPublishPackage(input.publishPackage);

    if (currentAudit.ready) {
      return this.toRepairResult(input.publishPackage, currentAudit, false);
    }

    const payload = await this.requestTextJson([
      {
        content:
          '你是小红书图文发布包质检编辑。只返回 JSON，不要 Markdown，不要解释。',
        role: 'system',
      },
      {
        content: [
          `用户想法：${this.requireText(input.idea, '创作想法')}`,
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
    const repairedPackage = this.toRepairedPublishPackage(
      payload,
      input.publishPackage,
    );
    const repairedAudit = auditXhsImageTextPublishPackage(repairedPackage);

    return this.toRepairResult(repairedPackage, repairedAudit, true);
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

  private async requestTextJson(
    messages: Array<{ content: string; role: 'system' | 'user' }>,
  ): Promise<Record<string, unknown>> {
    const config = await this.modelConfigs.getRuntimeConfig('text');
    const response = await postProviderJson(
      createProviderEndpoint(config.baseUrl, 'chat/completions'),
      config.apiKey,
      {
        messages,
        model: config.modelName,
        response_format: { type: 'json_object' },
        temperature: 0.55,
      },
    );

    return parseProviderJsonObject(extractChatContent(response));
  }

  private toRepairedPublishPackage(
    payload: Record<string, unknown>,
    current: XhsImageTextPublishPackage,
  ): XhsImageTextPublishPackage {
    const rawPackage = isRecord(payload.publishPackage)
      ? payload.publishPackage
      : payload;
    const pages = this.requirePages(rawPackage.pages);
    const titleCandidates = this.requireStringArray(
      rawPackage.titleCandidates,
      '标题候选',
      1,
    );
    const caption = this.requireText(rawPackage.caption, '正文');
    const hashtags = this.requireStringArray(
      rawPackage.hashtags,
      '标签',
      1,
    ).map((tag) => tag.replace(/^#+/, ''));
    const imagePromptPack = this.requireStringArray(
      rawPackage.imagePromptPack,
      '图片提示词',
      pages.length,
    );
    const hashtagText = hashtags.map((tag) => `#${tag}`).join(' ');
    const pageText = pages
      .map(
        (page) =>
          `P${page.pageNumber} ${page.headline}\n${page.body.join('\n')}`,
      )
      .join('\n\n');
    const title =
      titleCandidates[0] ?? current.titleCandidates[0] ?? current.idea;

    return {
      ...current,
      caption,
      copyBlocks: {
        caption,
        hashtags: hashtagText,
        pageText,
        publishText: `${title}\n\n${caption}\n\n${hashtagText}`,
        title,
      },
      hashtags,
      imagePromptPack,
      pages,
      platform: 'xiaohongshu',
      titleCandidates,
    };
  }

  private requirePages(value: unknown): XhsImageTextPage[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('修复后的分页格式无效。');
    }

    const pages = value.map((page, index) => this.requirePage(page, index));

    if (pages.length < 4 || pages.length > 7) {
      throw new BadRequestException('修复后的分页需要保持 4 到 7 页。');
    }

    return pages;
  }

  private requirePage(value: unknown, index: number): XhsImageTextPage {
    if (!isRecord(value)) {
      throw new BadRequestException(`第 ${index + 1} 页格式无效。`);
    }

    return {
      body: this.requireStringArray(value.body, `第 ${index + 1} 页正文`, 1),
      designNotes: this.requireStringArray(
        value.designNotes,
        `第 ${index + 1} 页设计说明`,
        1,
      ),
      headline: this.requireText(value.headline, `第 ${index + 1} 页标题`),
      imagePrompt: this.requireText(
        value.imagePrompt,
        `第 ${index + 1} 页图片提示词`,
      ),
      pageNumber: index + 1,
      role: this.requirePageRole(value.role, index),
    };
  }

  private requirePageRole(
    value: unknown,
    index: number,
  ): XhsImageTextPage['role'] {
    if (value === 'cover' || value === 'content' || value === 'summary') {
      return value;
    }

    if (index === 0) return 'cover';
    return 'content';
  }

  private requireStringArray(
    value: unknown,
    fieldName: string,
    minLength: number,
  ): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName}格式无效。`);
    }

    const items = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    if (items.length < minLength) {
      throw new BadRequestException(`${fieldName}数量不足。`);
    }

    return items;
  }

  private requireText(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName}不能为空。`);
    }

    return value.trim();
  }

  private toRepairResult(
    publishPackage: XhsImageTextPublishPackage,
    audit: XhsPublishPackageAudit,
    repaired: boolean,
  ): RepairedXhsPublishPackage {
    return {
      audit,
      publishPackage,
      repaired,
      summary: {
        ready: audit.ready,
        repairActionCount: audit.repairActions.length,
        score: audit.score,
      },
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
