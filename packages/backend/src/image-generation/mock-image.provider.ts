import { Injectable } from '@nestjs/common';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageProvider,
} from './image-generation.types';

const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;base64,';

@Injectable()
export class MockImageProvider implements ImageProvider {
  async generate(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
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
    const title = escapeXml(compactText(input.title, 22));
    const topic = escapeXml(compactText(input.topic, 42));
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
  <text x="112" y="458" font-size="54" font-weight="700" fill="#241816" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${title}</text>
  <text x="112" y="552" font-size="34" font-weight="500" fill="#6c5551" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${topic}</text>
  <rect x="112" y="664" width="676" height="236" rx="30" fill="#fff0ec" stroke="#f8c9bf" stroke-width="4"/>
  <circle cx="186" cy="742" r="42" fill="#f03850"/>
  <circle cx="304" cy="820" r="42" fill="#ffb84d"/>
  <circle cx="422" cy="742" r="42" fill="#66c2a5"/>
  <path d="M540 792 C604 708, 696 718, 732 800 C680 884, 588 876, 540 792 Z" fill="#f6d365"/>
  <text x="112" y="996" font-size="32" font-weight="600" fill="#f03850" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${tags}</text>
  <text x="112" y="1062" font-size="28" fill="#8d746f" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">mock cover preview - ${escapeXml(
    compactText(input.postDraftId, 18),
  )}</text>
</svg>`;
  }
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
