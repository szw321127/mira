import { BadRequestException } from '@nestjs/common';

type ProviderErrorBody = {
  error?: {
    message?: unknown;
  };
  message?: unknown;
};

export function createProviderEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export async function postProviderJson(
  url: string,
  apiKey: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new BadRequestException(getProviderErrorMessage(payload));
  }

  return payload;
}

export function extractChatContent(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new BadRequestException('文本模型响应格式无效。');
  }

  const choices = payload.choices;

  if (!Array.isArray(choices)) {
    throw new BadRequestException('文本模型响应格式无效。');
  }

  const firstChoice = choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new BadRequestException('文本模型响应格式无效。');
  }

  const content = firstChoice.message.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new BadRequestException('文本模型响应内容为空。');
  }

  return content;
}

export function parseProviderJsonObject(
  content: string,
): Record<string, unknown> {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(normalized);

    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    throw new BadRequestException('文本模型没有返回有效 JSON。');
  }

  throw new BadRequestException('文本模型没有返回有效 JSON。');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getProviderErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return '模型服务请求失败。';
  }

  const errorBody = payload as ProviderErrorBody;
  const nestedMessage = errorBody.error?.message;

  if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
    return nestedMessage;
  }

  if (typeof errorBody.message === 'string' && errorBody.message.trim()) {
    return errorBody.message;
  }

  return '模型服务请求失败。';
}
