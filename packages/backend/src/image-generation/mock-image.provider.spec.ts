import { MockImageProvider } from './mock-image.provider';

describe('MockImageProvider', () => {
  it('returns a safe SVG data URL cover image', async () => {
    const provider = new MockImageProvider();

    const result = await provider.generate({
      coverLine: '实用攻略 高保存率',
      imagePrompt: '封面有红色贴纸和生活道具',
      postDraftId: 'draft-1',
      tags: ['小红书图文', '备餐'],
      title: '周末备餐也能很好看',
      topic: '周末备餐 <script>alert(1)</script>',
    });

    expect(result.provider).toBe('mock');
    expect(result.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);

    const encoded = result.imageUrl.replace('data:image/svg+xml;base64,', '');
    const svg = Buffer.from(encoded, 'base64').toString('utf8');

    expect(svg).toContain('实用攻略 高保存率');
    expect(svg).toContain('周末备餐');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
