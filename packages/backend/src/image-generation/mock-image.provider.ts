import { Injectable } from '@nestjs/common';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageProvider,
} from './image-generation.types';

const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;base64,';

@Injectable()
export class MockImageProvider implements ImageProvider {
  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const svg = this.createSvg(input);

    return {
      generatedAt: new Date(),
      imageUrl: `${SVG_DATA_URL_PREFIX}${Buffer.from(svg, 'utf8').toString(
        'base64',
      )}`,
      provider: 'mock',
    };
  }

  private createSvg(input: ImageGenerationInput): string {
    const coverLine = escapeXml(compactText(input.coverLine, 18));
    const titleLines = wrapText(input.title, 12, 2);
    const topicLines = wrapText(input.topic, 22, 2);
    const topicY = 552 + (titleLines.length - 1) * 64;
    const imageBoxY = 664 + (topicLines.length - 1) * 44;
    const tags = input.tags
      .slice(0, 4)
      .map((tag) => `#${escapeXml(compactText(tag, 9))}`)
      .join('  ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" role="img" aria-label="Mock Xiaohongshu cover">
  <rect width="900" height="1200" fill="#fff7f4"/>
  <rect x="54" y="58" width="792" height="1084" rx="42" fill="#fffdfb" stroke="#f03850" stroke-width="10"/>
  <rect x="102" y="116" width="214" height="74" rx="37" fill="#f03850"/>
  <text x="209" y="164" text-anchor="middle" font-size="34" font-weight="700" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">小红书图文</text>
  <text x="112" y="346" font-size="78" font-weight="800" fill="#241816" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${coverLine}</text>
  ${createTextBlock(titleLines, {
    fill: '#241816',
    fontSize: 54,
    fontWeight: 700,
    lineHeight: 64,
    role: 'title-line',
    x: 112,
    y: 458,
  })}
  ${createTextBlock(topicLines, {
    fill: '#6c5551',
    fontSize: 34,
    fontWeight: 500,
    lineHeight: 44,
    role: 'topic-line',
    x: 112,
    y: topicY,
  })}
  <rect x="112" y="${imageBoxY}" width="676" height="236" rx="30" fill="#fff0ec" stroke="#f8c9bf" stroke-width="4"/>
  <circle cx="186" cy="${imageBoxY + 78}" r="42" fill="#f03850"/>
  <circle cx="304" cy="${imageBoxY + 156}" r="42" fill="#ffb84d"/>
  <circle cx="422" cy="${imageBoxY + 78}" r="42" fill="#66c2a5"/>
  <path d="M540 ${imageBoxY + 128} C604 ${imageBoxY + 44}, 696 ${imageBoxY + 54}, 732 ${imageBoxY + 136} C680 ${imageBoxY + 220}, 588 ${imageBoxY + 212}, 540 ${imageBoxY + 128} Z" fill="#f6d365"/>
  <text x="112" y="996" font-size="32" font-weight="600" fill="#f03850" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${tags}</text>
  <text x="112" y="1062" font-size="28" fill="#8d746f" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">mock cover preview - ${escapeXml(
    compactText(input.postDraftId, 18),
  )}</text>
</svg>`;
  }
}

type TextBlockOptions = {
  fill: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  role: string;
  x: number;
  y: number;
};

function createTextBlock(lines: string[], options: TextBlockOptions): string {
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan data-role="${options.role}" x="${options.x}" y="${
          options.y + index * options.lineHeight
        }">${escapeXml(line)}</tspan>`,
    )
    .join('');

  return `<text font-size="${options.fontSize}" font-weight="${options.fontWeight}" fill="${options.fill}" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${tspans}</text>`;
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function wrapText(
  value: string,
  maxLineLength: number,
  maxLines: number,
): string[] {
  const normalized = value.trim().replace(/\s+/g, ' ');

  if (!normalized) return [''];

  const delimiterParts = normalized
    .split(/[｜|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (delimiterParts.length > 1 && delimiterParts.length <= maxLines) {
    return delimiterParts.map((part) => compactText(part, maxLineLength));
  }

  const lines: string[] = [];
  let remaining = normalized;

  while (remaining.length > 0 && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;
    const lineLimit = isLastLine ? maxLineLength - 3 : maxLineLength;

    if (remaining.length <= maxLineLength) {
      lines.push(remaining);
      break;
    }

    lines.push(
      isLastLine
        ? `${remaining.slice(0, Math.max(1, lineLimit))}...`
        : remaining.slice(0, maxLineLength),
    );
    remaining = remaining.slice(maxLineLength);
  }

  return lines;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
