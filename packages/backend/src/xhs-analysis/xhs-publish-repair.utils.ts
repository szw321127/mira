import { BadRequestException } from '@nestjs/common';
import type {
  XhsImageTextPage,
  XhsImageTextPublishPackage,
  XhsPublishPackageAudit,
} from '@rednote/agent';
import { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import {
  createProviderEndpoint,
  extractChatContent,
  isRecord,
  parseProviderJsonObject,
  postProviderJson,
} from '../model-provider/openai-compatible';
import type { RepairedXhsPublishPackage } from './xhs-analysis.types';

export async function requestTextJson(
  modelConfigs: AdminModelConfigsService,
  messages: Array<{ content: string; role: 'system' | 'user' }>,
): Promise<Record<string, unknown>> {
  const config = await modelConfigs.getRuntimeConfig('text');
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

export function toRepairedPublishPackage(
  payload: Record<string, unknown>,
  current: XhsImageTextPublishPackage,
): XhsImageTextPublishPackage {
  const rawPackage = isRecord(payload.publishPackage)
    ? payload.publishPackage
    : payload;
  const pages = requirePages(rawPackage.pages);
  const titleCandidates = requireStringArray(
    rawPackage.titleCandidates,
    '标题候选',
    1,
  );
  const caption = requireText(rawPackage.caption, '正文');
  const hashtags = requireStringArray(rawPackage.hashtags, '标签', 1).map(
    (tag) => tag.replace(/^#+/, ''),
  );
  const imagePromptPack = requireStringArray(
    rawPackage.imagePromptPack,
    '图片提示词',
    pages.length,
  );
  const hashtagText = hashtags.map((tag) => `#${tag}`).join(' ');
  const pageText = pages
    .map(
      (page) => `P${page.pageNumber} ${page.headline}\n${page.body.join('\n')}`,
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

export function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${fieldName}不能为空。`);
  }

  return value.trim();
}

export function toRepairResult(
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

function requirePages(value: unknown): XhsImageTextPage[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('修复后的分页格式无效。');
  }

  const pages = value.map((page, index) => requirePage(page, index));

  if (pages.length < 4 || pages.length > 7) {
    throw new BadRequestException('修复后的分页需要保持 4 到 7 页。');
  }

  return pages;
}

function requirePage(value: unknown, index: number): XhsImageTextPage {
  if (!isRecord(value)) {
    throw new BadRequestException(`第 ${index + 1} 页格式无效。`);
  }

  return {
    body: requireStringArray(value.body, `第 ${index + 1} 页正文`, 1),
    designNotes: requireStringArray(
      value.designNotes,
      `第 ${index + 1} 页设计说明`,
      1,
    ),
    headline: requireText(value.headline, `第 ${index + 1} 页标题`),
    imagePrompt: requireText(value.imagePrompt, `第 ${index + 1} 页图片提示词`),
    pageNumber: index + 1,
    role: requirePageRole(value.role, index),
  };
}

function requirePageRole(
  value: unknown,
  index: number,
): XhsImageTextPage['role'] {
  if (value === 'cover' || value === 'content' || value === 'summary') {
    return value;
  }

  if (index === 0) return 'cover';
  return 'content';
}

function requireStringArray(
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
