import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  analyzeXhsPopularSamples,
  buildXhsResearchBackedOutlines,
  buildXhsSearchKeywords,
  normalizeXhsImportedPosts,
} from '@rednote/agent/xhs-analysis';
import type {
  XhsPopularSampleInput,
  XhsPopularSamplesAnalysis,
  XhsResearchMode,
} from '@rednote/agent/xhs-analysis';
import { AdminContentProvidersService } from '../admin-content-providers/admin-content-providers.service';
import { parseStringArray, stringifyJson } from '../common/json';
import {
  createProviderEndpoint,
  isRecord,
  postProviderJson,
} from '../model-provider/openai-compatible';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BuildXhsResearchOutlinesInput,
  XhsResearchOutlinesResult,
  XhsResearchRunView,
} from './xhs-analysis.types';

const outlineBatchInclude = {
  outlines: { orderBy: { position: 'asc' as const } },
};

@Injectable()
export class XhsResearchOutlinesService {
  private readonly logger = new Logger(XhsResearchOutlinesService.name);

  constructor(
    private readonly contentProviders: AdminContentProvidersService,
    private readonly prisma: PrismaService,
  ) {}

  async buildResearchOutlines(
    input: BuildXhsResearchOutlinesInput,
    userId: string,
  ): Promise<XhsResearchOutlinesResult> {
    const idea = input.idea.trim();
    const conversationId = input.conversationId.trim();
    const mode = input.mode ?? 'quick';

    if (!idea) {
      throw new BadRequestException('先写一句主题，再生成新的大纲。');
    }

    await this.ensureOwnedConversation(userId, conversationId);

    const runtimeConfig =
      await this.contentProviders.getRuntimeConfig('custom');
    const endpoint = createProviderEndpoint(
      runtimeConfig.baseUrl,
      'xhs/posts/search',
    );
    const keywords = buildXhsSearchKeywords({ idea, mode });
    const startedAt = Date.now();
    const searchResult = await this.searchPopularSamples({
      apiKey: runtimeConfig.apiKey,
      endpoint,
      keywords,
      limit: mode === 'deep' ? 10 : 5,
    });
    const analysis = analyzeXhsPopularSamples({
      failedKeywords: searchResult.failedKeywords,
      idea,
      keywords,
      samples: searchResult.samples,
    });
    const candidates = buildXhsResearchBackedOutlines({ analysis, idea });

    const result = await this.prisma.$transaction(async (tx) => {
      const latestBatch = await tx.outlineBatch.findFirst({
        orderBy: { batchNo: 'desc' },
        where: { conversationId },
      });
      const batchNo = (latestBatch?.batchNo ?? -1) + 1;
      const researchRun = await tx.xhsResearchRun.create({
        data: {
          analysis: stringifyJson(analysis),
          conversationId,
          errorMessage: analysis.warnings.join('\n') || null,
          idea,
          keywords: stringifyJson(keywords),
          mode,
          providerEndpoint: endpoint,
          providerType: runtimeConfig.type,
          sampleCount: analysis.sampleCount,
          samples: stringifyJson(analysis.summary.standoutSamples),
          status: analysis.status,
          summary: stringifyJson(analysis.summary),
        },
      });
      const batch = await tx.outlineBatch.create({
        data: {
          batchNo,
          conversationId,
          outlines: {
            create: candidates.map((outline, position) => ({
              hook: outline.selectionReason,
              label: this.toOutlineLabel(outline.strategy),
              points: stringifyJson(outline.outline),
              position,
              title: outline.title,
              tone: this.toOutlineTone(outline.strategy),
            })),
          },
          prompt: idea,
        },
        include: outlineBatchInclude,
      });
      const firstOutlineId = batch.outlines[0]?.id;

      await tx.postDraft.updateMany({
        data: { stale: true },
        where: { conversationId },
      });
      await tx.conversation.update({
        data: {
          selectedOutlineId: firstOutlineId,
          statusMessage: this.buildResearchStatusMessage(analysis),
          title: idea.slice(0, 24) || '未命名创作',
          topic: idea,
        },
        where: { id: conversationId },
      });

      return {
        batch: this.toResearchOutlineBatch(batch),
        research: this.toResearchRunView(researchRun),
      };
    });

    this.logger.log({
      conversationId,
      durationMs: Date.now() - startedAt,
      failedKeywordCount: analysis.failedKeywords.length,
      keywordCount: keywords.length,
      mode,
      researchRunId: result.research.id,
      sampleCount: analysis.sampleCount,
      status: analysis.status,
      warningCount: analysis.warnings.length,
    });

    return result;
  }

  private async searchPopularSamples(input: {
    apiKey: string;
    endpoint: string;
    keywords: string[];
    limit: number;
  }): Promise<{
    failedKeywords: string[];
    samples: XhsPopularSampleInput[];
  }> {
    const failedKeywords: string[] = [];
    const samples: XhsPopularSampleInput[] = [];
    let validResponseCount = 0;

    for (const chunk of this.chunk(input.keywords, 2)) {
      await Promise.all(
        chunk.map(async (keyword) => {
          try {
            const payload = await postProviderJson(
              input.endpoint,
              input.apiKey,
              { keyword, limit: input.limit, sort: 'popular' },
            );
            const records = this.extractSearchRecords(payload);
            validResponseCount += 1;
            const imported = normalizeXhsImportedPosts(
              records.map((record, index) => ({
                raw: record,
                source: 'provider',
                sourceId:
                  this.pickRawSourceId(record) ??
                  this.pickRawTitle(record) ??
                  `${keyword}-${index + 1}`,
              })),
            );

            imported.posts.forEach((post, index) => {
              samples.push({
                ...post,
                keyword,
                sourceId:
                  imported.sources[index]?.normalizedId ??
                  post.url ??
                  post.title,
              });
            });
          } catch {
            failedKeywords.push(keyword);
          }
        }),
      );
    }

    if (validResponseCount === 0 && failedKeywords.length) {
      throw new BadRequestException(
        '小红书连接器搜索失败，请检查内容来源配置或稍后重试。',
      );
    }

    return { failedKeywords, samples };
  }

  private extractSearchRecords(payload: unknown): Record<string, unknown>[] {
    const data = this.unwrapProviderEnvelope(payload);

    if (Array.isArray(data)) return data.filter(isRecord);
    if (!isRecord(data)) {
      throw new BadRequestException('内容来源响应格式无效。');
    }

    const records = [
      data.posts,
      data.items,
      data.notes,
      data.noteList,
      data.note_list,
    ].find(Array.isArray);

    if (!records) {
      throw new BadRequestException('内容来源响应格式无效。');
    }

    return records.filter(isRecord);
  }

  private unwrapProviderEnvelope(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;
    if ('data' in payload) return this.unwrapProviderEnvelope(payload.data);
    if ('result' in payload) return this.unwrapProviderEnvelope(payload.result);
    return payload;
  }

  private pickRawSourceId(record: Record<string, unknown>): string | undefined {
    const value =
      record.note_id ??
      record.noteId ??
      record.id ??
      record.sourceId ??
      record.url;

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private pickRawTitle(record: Record<string, unknown>): string | undefined {
    const value = record.title;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }

  private toResearchOutlineBatch(batch: {
    batchNo: number;
    conversationId: string;
    createdAt: Date;
    id: string;
    outlines: Array<{
      batchId: string;
      createdAt: Date;
      hook: string;
      id: string;
      label: string;
      points: string;
      position: number;
      title: string;
      tone: string;
      updatedAt: Date;
    }>;
    prompt: string;
  }) {
    return {
      batchNo: batch.batchNo,
      conversationId: batch.conversationId,
      createdAt: batch.createdAt,
      id: batch.id,
      outlines: batch.outlines.map((outline) => ({
        batchId: outline.batchId,
        createdAt: outline.createdAt,
        hook: outline.hook,
        id: outline.id,
        label: outline.label,
        points: parseStringArray(outline.points),
        position: outline.position,
        title: outline.title,
        tone: outline.tone,
        updatedAt: outline.updatedAt,
      })),
      prompt: batch.prompt,
    };
  }

  private toResearchRunView(run: {
    analysis: string;
    createdAt: Date;
    id: string;
    idea: string;
    keywords: string;
    mode: string;
    providerEndpoint: string | null;
    providerType: string;
    sampleCount: number;
  }): XhsResearchRunView {
    const analysis = this.parseStoredResearchAnalysis(run.analysis);

    return {
      confidence: analysis.confidence,
      createdAt: run.createdAt,
      failedKeywords: analysis.failedKeywords,
      id: run.id,
      idea: run.idea,
      keywords: this.parseStoredStringArray(run.keywords),
      mode: this.toResearchMode(run.mode),
      providerEndpoint: run.providerEndpoint,
      providerType: this.toProviderType(run.providerType),
      sampleCount: run.sampleCount,
      status: analysis.status,
      summary: analysis.summary,
      warnings: analysis.warnings,
    };
  }

  private parseStoredResearchAnalysis(value: string): XhsPopularSamplesAnalysis {
    try {
      const parsed = JSON.parse(value) as XhsPopularSamplesAnalysis;

      if (
        parsed &&
        Array.isArray(parsed.keywords) &&
        Array.isArray(parsed.warnings) &&
        parsed.summary
      ) {
        return parsed;
      }
    } catch {
      // handled below
    }

    throw new BadRequestException('研究记录数据损坏，请重新生成。');
  }

  private parseStoredStringArray(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // handled below
    }

    return [];
  }

  private toResearchMode(value: string): XhsResearchMode {
    return value === 'deep' ? 'deep' : 'quick';
  }

  private toProviderType(value: string): XhsResearchRunView['providerType'] {
    return value === 'tikhub' ? 'tikhub' : 'custom';
  }

  private toOutlineTone(strategy: string) {
    if (strategy === 'checklist') return 'checklist';
    if (strategy === 'pain-point') return 'story';
    return 'guide';
  }

  private toOutlineLabel(strategy: string) {
    if (strategy === 'pain-point') return '痛点切入';
    if (strategy === 'step-by-step') return '步骤教程';
    return '收藏清单';
  }

  private buildResearchStatusMessage(analysis: XhsPopularSamplesAnalysis) {
    if (analysis.status === 'fallback_no_samples') {
      return '本次样本不足，已生成可编辑大纲，请先人工 review。';
    }

    if (analysis.warnings.length) {
      return '已生成研究参考大纲，部分样本信号需要人工复核。';
    }

    return '已根据小红书热门样本生成新一批大纲。';
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
      throw new BadRequestException('对话不存在或无权生成研究大纲。');
    }

    return conversation;
  }
}
