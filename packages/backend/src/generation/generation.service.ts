import { BadRequestException, Injectable } from '@nestjs/common';
import { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import {
  createProviderEndpoint,
  extractChatContent,
  isRecord,
  parseProviderJsonObject,
  postProviderJson,
} from '../model-provider/openai-compatible';
import type {
  GeneratedOutline,
  GeneratedPostDraft,
  OutlineForDraft,
  OutlineTone,
} from './generation.types';

const outlineTones: OutlineTone[] = ['checklist', 'guide', 'story'];

@Injectable()
export class GenerationService {
  constructor(private readonly modelConfigs: AdminModelConfigsService) {}

  async createOutlines(
    topic: string,
    batchNo: number,
  ): Promise<GeneratedOutline[]> {
    const payload = await this.requestTextJson([
      {
        content:
          '你是小红书图文内容策划。只返回 JSON，不要 Markdown，不要解释。',
        role: 'system',
      },
      {
        content: [
          `围绕用户想法「${this.normalizeTopic(topic)}」一次生成 3 个大纲。`,
          `这是第 ${batchNo + 1} 批，需要和之前批次有明显差异。`,
          '返回 JSON 格式：{"outlines":[{"title":"...","hook":"...","label":"...","tone":"guide|story|checklist","points":["..."]}]}。',
          '每个大纲 points 保持 5 条，语言要面向最终创作者选择，不要写系统提示。',
        ].join('\n'),
        role: 'user',
      },
    ]);
    const outlines = payload.outlines;

    if (!Array.isArray(outlines) || outlines.length !== 3) {
      throw new BadRequestException('文本模型需要返回 3 个大纲。');
    }

    return outlines.map((outline, index) =>
      this.toGeneratedOutline(outline, index),
    );
  }

  async createPostDraft(
    topic: string,
    outline: OutlineForDraft,
  ): Promise<GeneratedPostDraft> {
    const payload = await this.requestTextJson([
      {
        content:
          '你是小红书图文成稿编辑。只返回 JSON，不要 Markdown，不要解释。',
        role: 'system',
      },
      {
        content: [
          `用户想法：${this.normalizeTopic(topic)}`,
          `已选大纲：${JSON.stringify(outline)}`,
          '请生成最终可以直接发布的小红书图文内容。',
          '返回 JSON 格式：{"title":"...","coverLine":"...","caption":"...","sections":["..."],"tags":["..."],"imagePrompt":"..."}。',
          '要求：title 可直接发布；coverLine 不超过 18 个中文字符；sections 必须是正文段落或图文分页文案；不要返回大纲要点、创作建议、执行说明或写给 AI 的提示；tags 不带 #；imagePrompt 用于生成竖版封面图。',
        ].join('\n'),
        role: 'user',
      },
    ]);

    return this.toGeneratedPostDraft(payload);
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
        temperature: 0.8,
      },
    );

    return parseProviderJsonObject(extractChatContent(response));
  }

  private toGeneratedOutline(value: unknown, index: number): GeneratedOutline {
    if (!isRecord(value)) {
      throw new BadRequestException(`第 ${index + 1} 个大纲格式无效。`);
    }

    const title = this.requireString(value.title, '大纲标题');
    const hook = this.requireString(value.hook, '大纲钩子');
    const label = this.requireString(value.label, '大纲标签');
    const tone = this.requireTone(value.tone);
    const points = this.requireStringArray(value.points, '大纲要点', 5);

    if (points.length !== 5) {
      throw new BadRequestException('每个大纲需要返回 5 个要点。');
    }

    return {
      hook,
      label,
      points,
      title,
      tone,
    };
  }

  private toGeneratedPostDraft(
    payload: Record<string, unknown>,
  ): GeneratedPostDraft {
    const sections = this.requireStringArray(payload.sections, '正文分页', 1);
    const tags = this.requireStringArray(payload.tags, '标签', 1);

    return {
      caption: this.requireString(payload.caption, '正文导语'),
      coverLine: this.requireString(payload.coverLine, '封面标题').slice(0, 18),
      imagePrompt: this.requireString(payload.imagePrompt, '图片提示词'),
      sections,
      tags,
      title: this.requireString(payload.title, '标题'),
    };
  }

  private requireString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName}不能为空。`);
    }

    return value.trim();
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

  private requireTone(value: unknown): OutlineTone {
    if (outlineTones.includes(value as OutlineTone)) {
      return value as OutlineTone;
    }

    throw new BadRequestException('大纲类型无效。');
  }

  private normalizeTopic(topic: string): string {
    const trimmed = topic.trim();

    if (!trimmed) {
      throw new BadRequestException('请输入创作想法。');
    }

    return trimmed;
  }
}
