import { Injectable } from '@nestjs/common';
import { AiTextModelService } from '../model-provider/ai-text-model.service';
import { isRecord } from '../model-provider/openai-compatible';
import {
  buildXhsResearchBackedOutlines,
  type XhsPopularSampleInput,
  type XhsPopularSamplesAnalysis,
  type XhsPopularSamplesSummary,
  type XhsResearchMode,
} from './domain';

export type XhsResearchGeneratedOutline = {
  hook: string;
  label: string;
  points: string[];
  title: string;
  tone: string;
};

export type XhsResearchAiResult = {
  analysis: XhsPopularSamplesAnalysis;
  outlines: XhsResearchGeneratedOutline[];
};

@Injectable()
export class XhsResearchAiService {
  constructor(private readonly textModel: AiTextModelService) {}

  async generateResearchOutlines(input: {
    analysis: XhsPopularSamplesAnalysis;
    idea: string;
    keywords: string[];
    mode: XhsResearchMode;
    samples: XhsPopularSampleInput[];
  }): Promise<XhsResearchAiResult> {
    const payload = await this.textModel.generateTextJson({
      maxOutputTokens: 2800,
      messages: [
        {
          content:
            '你是小红书爆款图文研究员和大纲策划。只返回 JSON，不要 Markdown，不要解释。',
          role: 'system',
        },
        {
          content: this.buildPrompt(input),
          role: 'user',
        },
      ],
      temperature: 0.65,
    });
    const analysis = this.mergeAnalysis(input.analysis, payload);

    return {
      analysis,
      outlines: this.normalizeOutlines(payload.outlines, input.idea, analysis),
    };
  }

  private buildPrompt(input: {
    analysis: XhsPopularSamplesAnalysis;
    idea: string;
    keywords: string[];
    mode: XhsResearchMode;
    samples: XhsPopularSampleInput[];
  }) {
    return [
      `用户想法：${input.idea}`,
      `搜索模式：${input.mode}`,
      `搜索关键词：${JSON.stringify(input.keywords)}`,
      `本地样本信号：${JSON.stringify(input.analysis.summary)}`,
      `热门样本：${JSON.stringify(this.toPromptSamples(input.samples))}`,
      '请总结这些样本的 hook、结构、标签和角度，然后生成 3 个用户可编辑的大纲。',
      '返回 JSON 格式：{"summary":{"hookPatterns":["..."],"outlinePatterns":["..."],"tagPatterns":["..."],"contentAngles":["..."],"avoidPatterns":["..."],"standoutSamples":[{"sourceId":"...","title":"...","matchedKeyword":"...","interactionSummary":"...","matchReason":"...","url":"..."}]},"outlines":[{"title":"...","label":"痛点切入","tone":"story|guide|checklist","hook":"为什么选这个大纲","points":["P1...","P2...","P3..."]}],"warnings":[]}',
      '不要照搬来源笔记标题和正文；points 必须是给创作者看的内容结构，不要写系统提示。',
    ].join('\n');
  }

  private toPromptSamples(samples: XhsPopularSampleInput[]) {
    return samples.slice(0, 12).map((sample) => ({
      contentSnippet: this.truncate(sample.content ?? '', 120),
      keyword: sample.keyword,
      metrics: sample.metrics,
      sourceId: sample.sourceId ?? sample.url ?? sample.title,
      tags: sample.tags?.slice(0, 8) ?? [],
      title: this.truncate(sample.title, 60),
      url: sample.url,
    }));
  }

  private mergeAnalysis(
    base: XhsPopularSamplesAnalysis,
    payload: Record<string, unknown>,
  ): XhsPopularSamplesAnalysis {
    const summaryPayload = isRecord(payload.summary) ? payload.summary : {};

    return {
      ...base,
      summary: {
        ...base.summary,
        avoidPatterns: this.pickStringArray(
          summaryPayload.avoidPatterns,
          base.summary.avoidPatterns,
        ),
        contentAngles: this.pickStringArray(
          summaryPayload.contentAngles,
          base.summary.contentAngles,
        ),
        hookPatterns: this.pickStringArray(
          summaryPayload.hookPatterns,
          base.summary.hookPatterns,
        ),
        outlinePatterns: this.pickStringArray(
          summaryPayload.outlinePatterns,
          base.summary.outlinePatterns,
        ),
        standoutSamples: base.summary.standoutSamples,
        tagPatterns: this.pickStringArray(
          summaryPayload.tagPatterns,
          base.summary.tagPatterns,
        ),
      },
      warnings: this.uniqueClean([
        ...base.warnings,
        ...this.pickStringArray(payload.warnings, []),
      ]),
    };
  }

  private normalizeOutlines(
    value: unknown,
    idea: string,
    analysis: XhsPopularSamplesAnalysis,
  ): XhsResearchGeneratedOutline[] {
    const outlines = Array.isArray(value)
      ? value
          .map((outline) => this.normalizeOutline(outline))
          .filter(
            (
              outline,
            ): outline is XhsResearchGeneratedOutline & {
              fallbackIndex?: number;
            } => Boolean(outline),
          )
      : [];
    const fallback = buildXhsResearchBackedOutlines({ analysis, idea }).map(
      (outline, index) => ({
        hook: outline.selectionReason,
        label:
          outline.strategy === 'pain-point'
            ? '痛点切入'
            : outline.strategy === 'step-by-step'
              ? '步骤教程'
              : '收藏清单',
        points: outline.outline,
        title: outline.title,
        tone:
          outline.strategy === 'checklist'
            ? 'checklist'
            : outline.strategy === 'pain-point'
              ? 'story'
              : 'guide',
        fallbackIndex: index,
      }),
    );

    return [...outlines, ...fallback]
      .slice(0, 3)
      .map(({ fallbackIndex, ...outline }) => outline);
  }

  private normalizeOutline(
    value: unknown,
  ): (XhsResearchGeneratedOutline & { fallbackIndex?: number }) | null {
    if (!isRecord(value)) return null;
    const title = this.pickString(value.title);
    const hook = this.pickString(value.hook);
    const label = this.pickString(value.label);
    const tone = this.pickString(value.tone);
    const points = this.pickStringArray(value.points, []);

    if (!title || !hook || !label || points.length < 3) return null;

    return {
      hook,
      label,
      points,
      title,
      tone: ['checklist', 'guide', 'story'].includes(tone) ? tone : 'guide',
    };
  }

  private pickString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  private pickStringArray(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) return fallback;
    const items = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    return items.length ? this.uniqueClean(items) : fallback;
  }

  private uniqueClean(values: string[]) {
    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private truncate(value: string, maxLength: number) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}…`
      : normalized;
  }
}
