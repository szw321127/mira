import { BadRequestException } from '@nestjs/common';
import { isRecord } from '../model-provider/openai-compatible';
import type {
  ImportXhsAccountInput,
  ImportXhsPostInput,
} from './xhs-analysis.types';

export function normalizePostImportInput(
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

export function normalizeAccountImportInput(
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

export function extractProviderRecord(
  payload: unknown,
  preferredKeys: string[],
): Record<string, unknown> {
  const data = unwrapProviderEnvelope(payload);

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

function unwrapProviderEnvelope(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  if ('data' in payload) {
    return unwrapProviderEnvelope(payload.data);
  }

  if ('result' in payload) {
    return unwrapProviderEnvelope(payload.result);
  }

  return payload;
}
