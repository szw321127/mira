# Publish Package Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete RedNote publish package with publish-ready text, a mock generated cover image, persisted image state, and frontend copy/download/save actions.

**Architecture:** Keep the existing outline-to-post workflow, but extend `PostDraft` into the persisted publish package contract. Add a backend image generation boundary with a mock provider that returns a `data:image/svg+xml;base64,...` cover image. Update the frontend API layer, mappers, autosave snapshots, and publish editor so image state restores with the rest of the workspace.

**Tech Stack:** NestJS, Prisma SQLite, Jest, Next.js App Router, React, Tailwind utility classes, Node test runner.

---

## Source Spec

- `docs/superpowers/specs/2026-06-06-publish-package-image-generation-design.md`

## File Structure

- Create `packages/backend/src/generation/generation.service.spec.ts`
  - Tests that generated post sections are publish-ready prose.
- Modify `packages/backend/src/generation/generation.service.ts`
  - Replace template-like post sections with final copy generation helpers.
- Create `packages/backend/src/image-generation/image-generation.types.ts`
  - Defines the provider input and output contract.
- Create `packages/backend/src/image-generation/mock-image.provider.ts`
  - Generates a deterministic SVG data URL cover image.
- Create `packages/backend/src/image-generation/image-generation.service.ts`
  - Calls the current provider and normalizes failures.
- Create `packages/backend/src/image-generation/image-generation.module.ts`
  - Exports `ImageGenerationService`.
- Create `packages/backend/src/image-generation/mock-image.provider.spec.ts`
  - Tests data URL shape and escaped SVG text.
- Modify `packages/backend/prisma/schema.prisma`
  - Adds image fields to `PostDraft`.
- Create a Prisma migration with `pnpm --filter @rednote/backend prisma:migrate -- --name add_post_draft_image_fields`
  - Adds nullable image fields and an `idle` default status.
- Create `packages/backend/src/conversations/dto/generate-post-draft-image.dto.ts`
  - Accepts an optional edited image prompt.
- Modify `packages/backend/src/conversations/conversations.module.ts`
  - Imports `ImageGenerationModule`.
- Modify `packages/backend/src/conversations/conversations.service.ts`
  - Serializes image fields, exposes post-draft lookup, and generates images for owned drafts.
- Modify `packages/backend/src/conversations/post-drafts.controller.ts`
  - Adds `GET /post-drafts/:id` and `POST /post-drafts/:id/image`.
- Create `packages/backend/src/conversations/conversations.service.spec.ts`
  - Tests image serialization and image generation ownership flow with mocked Prisma/provider.
- Modify `packages/web-frontend/lib/api.ts`
  - Adds backend image fields and `postDrafts.get` / `postDrafts.generateImage`.
- Modify `packages/web-frontend/app/workbench/types.ts`
  - Adds frontend post-draft image fields.
- Modify `packages/web-frontend/app/workbench/workspace-utils.ts`
  - Maps, snapshots, restores, and signatures include image fields.
- Modify `packages/web-frontend/app/workbench/workbench-design.test.mjs`
  - Adds source-level tests for publish package image state and UI action constraints.
- Create `packages/web-frontend/app/workbench/post-cover-preview.tsx`
  - Renders idle, generating, ready, and failed image states.
- Modify `packages/web-frontend/app/workbench/post-editor.tsx`
  - Converts the right panel into a publish package editor with preview and focused actions.
- Modify `packages/web-frontend/app/page.tsx`
  - Adds image generation/download flow and image-field-only merge handling.

---

### Task 1: Publish-Ready Backend Copy

**Files:**
- Create: `packages/backend/src/generation/generation.service.spec.ts`
- Modify: `packages/backend/src/generation/generation.service.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/generation/generation.service.spec.ts`:

```ts
import { GenerationService } from './generation.service';
import type { OutlineForDraft } from './generation.types';

describe('GenerationService post drafts', () => {
  const service = new GenerationService();

  const outline: OutlineForDraft = {
    hook: '先给读者一个立刻想收藏的理由。',
    id: 'outline-1',
    label: '高保存率',
    points: ['痛点场景', '准备清单', '操作步骤', '避坑提醒', '结尾互动'],
    title: '周末备餐也能很好看',
    tone: 'guide',
  };

  it('returns publish-ready prose instead of writing instructions', () => {
    const draft = service.createPostDraft(
      '小红书新手如何把周末备餐做得好看又省心',
      outline,
    );

    const body = [draft.caption, ...draft.sections].join('\n');

    expect(draft.title).toContain('周末备餐');
    expect(draft.coverLine.length).toBeLessThanOrEqual(18);
    expect(draft.sections).toHaveLength(5);
    expect(body).toContain('小红书新手');
    expect(body).not.toMatch(/写 2 到 3 句|用定调的方式|避免空泛形容/);
    expect(draft.tags).toEqual(
      expect.arrayContaining(['小红书图文', '实用攻略', '高保存率']),
    );
    expect(draft.imagePrompt).toContain('标题区域');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @rednote/backend test -- generation.service.spec.ts
```

Expected: FAIL because the current sections include phrases like `写 2 到 3 句`.

- [ ] **Step 3: Implement publish-ready copy generation**

Modify `packages/backend/src/generation/generation.service.ts`. Replace `createPostDraft` and add helper methods inside `GenerationService`:

```ts
  createPostDraft(topic: string, outline: OutlineForDraft): GeneratedPostDraft {
    const normalizedTopic = this.normalizeTopic(topic);
    const meta = toneMeta[outline.tone] ?? toneMeta.guide;
    const points = outline.points.length
      ? outline.points
      : ['痛点场景', '准备清单', '操作步骤', '避坑提醒', '结尾互动'];

    return {
      caption: this.createCaption(normalizedTopic, outline, meta.name),
      coverLine: this.createCoverLine(meta.name, outline.label),
      imagePrompt: `竖版小红书图文封面，主题为「${normalizedTopic}」，主标题使用「${this.createCoverLine(
        meta.name,
        outline.label,
      )}」，画面包含自然窗光、手写批注、红色贴纸和生活道具，标题区域留白清楚，整体干净、有真实创作感。`,
      sections: points.map((point, index) =>
        this.createSection(normalizedTopic, point, index, outline.tone),
      ),
      tags: ['小红书图文', meta.name, outline.label, '可直接发布'],
      title: this.createPostTitle(normalizedTopic, outline.title),
    };
  }

  private createCaption(
    topic: string,
    outline: OutlineForDraft,
    toneName: string,
  ): string {
    return `这篇想写给刚开始做小红书图文的人：${topic}其实不用一开始就追求复杂，只要先把「${outline.hook}」讲清楚，再用${toneName}的节奏把方法拆开，读者就能马上知道该怎么照着做。`;
  }

  private createCoverLine(toneName: string, label: string): string {
    const coverLine = `${toneName} ${label}`;
    return coverLine.length > 18 ? coverLine.slice(0, 18) : coverLine;
  }

  private createPostTitle(topic: string, outlineTitle: string): string {
    const compactTopic = topic.length > 18 ? `${topic.slice(0, 18)}...` : topic;
    return `${outlineTitle.replace('：', ' | ')}｜${compactTopic}`;
  }

  private createSection(
    topic: string,
    point: string,
    index: number,
    tone: OutlineTone,
  ): string {
    const sectionNo = index + 1;
    const toneLead: Record<OutlineTone, string> = {
      checklist: '可以直接照着这一步检查',
      guide: '真正好执行的关键在这里',
      story: '这一段要写得像发生在今天',
    };
    const practicalTip = [
      `先把「${point}」放到第一屏附近，让读者一眼知道这篇和「${topic}」有关。`,
      `准备内容时不要堆概念，直接写出一个能照做的小动作，比如时间、材料、顺序或判断标准。`,
      `如果过程里有取舍，把原因说清楚，比单纯说“高级”“好看”更容易被收藏。`,
      `遇到容易失败的地方，提前写出替代方案，读者会觉得这篇笔记真的替自己想过。`,
      `结尾把行动收回来：提醒读者先保存，再选一个最轻的步骤今天就试。`,
    ];

    return `${sectionNo}. ${point}：${toneLead[tone]}。${practicalTip[index % practicalTip.length]}`;
  }
```

- [ ] **Step 4: Run the backend generation test**

Run:

```bash
pnpm --filter @rednote/backend test -- generation.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/generation/generation.service.ts packages/backend/src/generation/generation.service.spec.ts
git commit -m "feat: generate publish-ready post copy"
```

---

### Task 2: Mock Image Generation Boundary

**Files:**
- Create: `packages/backend/src/image-generation/image-generation.types.ts`
- Create: `packages/backend/src/image-generation/mock-image.provider.ts`
- Create: `packages/backend/src/image-generation/image-generation.service.ts`
- Create: `packages/backend/src/image-generation/image-generation.module.ts`
- Create: `packages/backend/src/image-generation/mock-image.provider.spec.ts`

- [ ] **Step 1: Write the failing mock provider test**

Create `packages/backend/src/image-generation/mock-image.provider.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @rednote/backend test -- mock-image.provider.spec.ts
```

Expected: FAIL because `MockImageProvider` does not exist.

- [ ] **Step 3: Add the provider contract**

Create `packages/backend/src/image-generation/image-generation.types.ts`:

```ts
export type ImageGenerationInput = {
  coverLine: string;
  imagePrompt: string;
  postDraftId: string;
  tags: string[];
  title: string;
  topic: string;
};

export type ImageGenerationResult = {
  generatedAt: Date;
  imageUrl: string;
  provider: string;
};

export interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
```

- [ ] **Step 4: Add the mock image provider**

Create `packages/backend/src/image-generation/mock-image.provider.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageProvider,
} from './image-generation.types';

@Injectable()
export class MockImageProvider implements ImageProvider {
  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const svg = this.createSvg(input);

    return {
      generatedAt: new Date(),
      imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString(
        'base64',
      )}`,
      provider: 'mock',
    };
  }

  private createSvg(input: ImageGenerationInput): string {
    const topic = this.compact(input.topic, 30);
    const title = this.compact(input.title, 28);
    const coverLine = this.compact(input.coverLine, 18);
    const tagLine = input.tags
      .slice(0, 3)
      .map((tag) => `#${this.compact(tag.replace(/^#+/, ''), 8)}`)
      .join(' ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" role="img" aria-label="${this.escapeXml(
      coverLine,
    )}">
  <rect width="900" height="1200" fill="#fff8f1"/>
  <rect x="72" y="72" width="756" height="1056" rx="42" fill="#fffdf8" stroke="#eadfd3" stroke-width="4"/>
  <rect x="108" y="118" width="210" height="58" rx="29" fill="#ff2442"/>
  <text x="132" y="156" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">RedNote</text>
  <circle cx="705" cy="204" r="72" fill="#ffe1d8"/>
  <circle cx="738" cy="177" r="24" fill="#ff2442" opacity="0.86"/>
  <path d="M132 796 C230 724, 330 836, 428 760 S626 722, 760 808" fill="none" stroke="#ff2442" stroke-width="12" stroke-linecap="round"/>
  <text x="108" y="286" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#8a4b35">${this.escapeXml(
    topic,
  )}</text>
  <text x="108" y="420" font-family="Arial, sans-serif" font-size="78" font-weight="800" fill="#2f241f">${this.escapeXml(
    coverLine,
  )}</text>
  <text x="108" y="512" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#6f5b4f">${this.escapeXml(
    title,
  )}</text>
  <rect x="108" y="596" width="438" height="116" rx="28" fill="#fff1d6"/>
  <text x="136" y="666" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#8a4b35">真实步骤 / 可保存 / 可照做</text>
  <text x="108" y="994" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#9d8070">${this.escapeXml(
    tagLine,
  )}</text>
</svg>`;
  }

  private compact(value: string, maxLength: number): string {
    const compacted = value.replace(/\s+/g, ' ').trim();
    return compacted.length > maxLength
      ? `${compacted.slice(0, maxLength - 1)}…`
      : compacted;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
```

- [ ] **Step 5: Add the image generation service and module**

Create `packages/backend/src/image-generation/image-generation.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { MockImageProvider } from './mock-image.provider';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from './image-generation.types';

@Injectable()
export class ImageGenerationService {
  constructor(private readonly provider: MockImageProvider) {}

  generateCover(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    return this.provider.generate(input);
  }
}
```

Create `packages/backend/src/image-generation/image-generation.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ImageGenerationService } from './image-generation.service';
import { MockImageProvider } from './mock-image.provider';

@Module({
  exports: [ImageGenerationService],
  providers: [ImageGenerationService, MockImageProvider],
})
export class ImageGenerationModule {}
```

- [ ] **Step 6: Run the mock provider test**

Run:

```bash
pnpm --filter @rednote/backend test -- mock-image.provider.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/image-generation
git commit -m "feat: add mock image generation provider"
```

---

### Task 3: Backend PostDraft Image Fields And API

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: generated Prisma migration under `packages/backend/prisma/migrations/`
- Create: `packages/backend/src/conversations/dto/generate-post-draft-image.dto.ts`
- Modify: `packages/backend/src/conversations/conversations.module.ts`
- Modify: `packages/backend/src/conversations/conversations.service.ts`
- Modify: `packages/backend/src/conversations/post-drafts.controller.ts`
- Create: `packages/backend/src/conversations/conversations.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/backend/src/conversations/conversations.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import type { GenerationService } from '../generation/generation.service';
import type { ImageGenerationService } from '../image-generation/image-generation.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ConversationsService post draft images', () => {
  function createService() {
    const generation = {} as GenerationService;
    const images = {
      generateCover: jest.fn(),
    } as unknown as jest.Mocked<ImageGenerationService>;
    const prisma = {
      postDraft: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const service = new ConversationsService(generation, images, prisma);

    return { images, prisma, service };
  }

  const baseDraft = {
    caption: '正文开场',
    conversation: {
      topic: '周末备餐',
      userId: 'user-1',
    },
    conversationId: 'conversation-1',
    coverLine: '实用攻略 高保存率',
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
    id: 'draft-1',
    imageError: null,
    imageGeneratedAt: null,
    imagePrompt: '竖版封面',
    imageProvider: null,
    imageStatus: 'idle',
    imageUrl: null,
    outlineId: 'outline-1',
    sections: JSON.stringify(['第一段', '第二段']),
    stale: false,
    tags: JSON.stringify(['小红书图文', '备餐']),
    title: '周末备餐也能很好看',
    updatedAt: new Date('2026-06-06T00:01:00.000Z'),
  };

  it('serializes image fields with a post draft', () => {
    const { service } = createService();

    const result = (service as unknown as {
      toPostDraft: (draft: typeof baseDraft) => Record<string, unknown>;
    }).toPostDraft({
      ...baseDraft,
      imageGeneratedAt: new Date('2026-06-06T00:02:00.000Z'),
      imageProvider: 'mock',
      imageStatus: 'ready',
      imageUrl: 'data:image/svg+xml;base64,abc',
    });

    expect(result).toMatchObject({
      imageError: null,
      imageProvider: 'mock',
      imageStatus: 'ready',
      imageUrl: 'data:image/svg+xml;base64,abc',
    });
    expect(result.imageGeneratedAt).toEqual(
      new Date('2026-06-06T00:02:00.000Z'),
    );
  });

  it('generates a mock image for an owned post draft', async () => {
    const { images, prisma, service } = createService();

    prisma.postDraft.findFirst.mockResolvedValue(baseDraft as never);
    prisma.postDraft.update
      .mockResolvedValueOnce({
        ...baseDraft,
        imagePrompt: '新封面提示',
        imageStatus: 'generating',
      } as never)
      .mockResolvedValueOnce({
        ...baseDraft,
        imageGeneratedAt: new Date('2026-06-06T00:02:00.000Z'),
        imagePrompt: '新封面提示',
        imageProvider: 'mock',
        imageStatus: 'ready',
        imageUrl: 'data:image/svg+xml;base64,abc',
      } as never);
    images.generateCover.mockResolvedValue({
      generatedAt: new Date('2026-06-06T00:02:00.000Z'),
      imageUrl: 'data:image/svg+xml;base64,abc',
      provider: 'mock',
    });

    const result = await service.generatePostDraftImage('user-1', 'draft-1', {
      imagePrompt: '新封面提示',
    });

    expect(prisma.postDraft.findFirst).toHaveBeenCalledWith({
      include: { conversation: true },
      where: {
        conversationId: undefined,
        id: 'draft-1',
        conversation: { userId: 'user-1' },
      },
    });
    expect(images.generateCover).toHaveBeenCalledWith(
      expect.objectContaining({
        coverLine: '实用攻略 高保存率',
        imagePrompt: '新封面提示',
        postDraftId: 'draft-1',
        topic: '周末备餐',
      }),
    );
    expect(result).toMatchObject({
      imageProvider: 'mock',
      imageStatus: 'ready',
      imageUrl: 'data:image/svg+xml;base64,abc',
    });
  });

  it('marks the draft failed when provider generation fails', async () => {
    const { images, prisma, service } = createService();

    prisma.postDraft.findFirst.mockResolvedValue(baseDraft as never);
    prisma.postDraft.update.mockResolvedValue(baseDraft as never);
    images.generateCover.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.generatePostDraftImage('user-1', 'draft-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.postDraft.update).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        imageError: 'provider unavailable',
        imageStatus: 'failed',
      }),
      where: { id: 'draft-1' },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @rednote/backend test -- conversations.service.spec.ts
```

Expected: FAIL because the service constructor, image fields, and `generatePostDraftImage` do not exist.

- [ ] **Step 3: Add Prisma fields**

Modify `packages/backend/prisma/schema.prisma` inside `model PostDraft`:

```prisma
  imagePrompt      String
  imageUrl         String?
  imageStatus      String    @default("idle")
  imageProvider    String?
  imageError       String?
  imageGeneratedAt DateTime?
  sections         String
```

Run:

```bash
pnpm --filter @rednote/backend prisma:migrate -- --name add_post_draft_image_fields
```

Expected: Prisma creates a migration and regenerates the client.

- [ ] **Step 4: Add the image DTO**

Create `packages/backend/src/conversations/dto/generate-post-draft-image.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class GeneratePostDraftImageDto {
  @IsOptional()
  @IsString()
  imagePrompt?: string;
}
```

- [ ] **Step 5: Wire the image module into conversations**

Modify `packages/backend/src/conversations/conversations.module.ts`:

```ts
import { ImageGenerationModule } from '../image-generation/image-generation.module';
```

Then update module imports:

```ts
  imports: [AuthModule, GenerationModule, ImageGenerationModule, PrismaModule],
```

- [ ] **Step 6: Update the service constructor and post-draft methods**

Modify imports in `packages/backend/src/conversations/conversations.service.ts`:

```ts
import { ImageGenerationService } from '../image-generation/image-generation.service';
import type { GeneratePostDraftImageDto } from './dto/generate-post-draft-image.dto';
```

Update the constructor:

```ts
  constructor(
    private readonly generation: GenerationService,
    private readonly images: ImageGenerationService,
    private readonly prisma: PrismaService,
  ) {}
```

Add public methods near `updatePostDraft`:

```ts
  async getPostDraft(userId: string, postDraftId: string) {
    const draft = await this.findOwnedPostDraft(userId, postDraftId);

    return this.toPostDraft(draft);
  }

  async generatePostDraftImage(
    userId: string,
    postDraftId: string,
    dto: GeneratePostDraftImageDto,
  ) {
    const draft = await this.findOwnedPostDraft(userId, postDraftId);
    const imagePrompt = dto.imagePrompt?.trim() || draft.imagePrompt;

    const generatingDraft = await this.prisma.postDraft.update({
      data: {
        imageError: null,
        imagePrompt,
        imageStatus: 'generating',
      },
      where: { id: postDraftId },
    });

    try {
      const result = await this.images.generateCover({
        coverLine: generatingDraft.coverLine,
        imagePrompt: generatingDraft.imagePrompt,
        postDraftId,
        tags: parseStringArray(generatingDraft.tags),
        title: generatingDraft.title,
        topic: draft.conversation.topic,
      });

      const updated = await this.prisma.postDraft.update({
        data: {
          imageError: null,
          imageGeneratedAt: result.generatedAt,
          imageProvider: result.provider,
          imageStatus: 'ready',
          imageUrl: result.imageUrl,
        },
        where: { id: postDraftId },
      });

      return this.toPostDraft(updated);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Image generation failed.';

      await this.prisma.postDraft.update({
        data: {
          imageError: message,
          imageStatus: 'failed',
        },
        where: { id: postDraftId },
      });

      throw new BadRequestException(message);
    }
  }
```

- [ ] **Step 7: Update post-draft creation and serialization**

In `generatePostDraft`, make the created draft explicitly start idle:

```ts
        imageError: null,
        imageGeneratedAt: null,
        imagePrompt: generated.imagePrompt,
        imageProvider: null,
        imageStatus: 'idle',
        imageUrl: null,
```

In `toPostDraft`, include image fields:

```ts
      imageError: draft.imageError,
      imageGeneratedAt: draft.imageGeneratedAt,
      imageProvider: draft.imageProvider,
      imagePrompt: draft.imagePrompt,
      imageStatus: draft.imageStatus,
      imageUrl: draft.imageUrl,
```

Update `findOwnedPostDraft` to include conversation data:

```ts
  private async findOwnedPostDraft(
    userId: string,
    postDraftId: string,
    conversationId?: string,
  ): Promise<PostDraft & { conversation: Conversation }> {
    const draft = await this.prisma.postDraft.findFirst({
      include: { conversation: true },
      where: {
        conversationId,
        id: postDraftId,
        conversation: { userId },
      },
    });

    if (!draft) {
      throw new NotFoundException('Post draft not found.');
    }

    return draft;
  }
```

- [ ] **Step 8: Add post-draft routes**

Modify `packages/backend/src/conversations/post-drafts.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { GeneratePostDraftImageDto } from './dto/generate-post-draft-image.dto';
```

Add methods:

```ts
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.getPostDraft(user.id, id);
  }

  @Post(':id/image')
  generateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GeneratePostDraftImageDto,
  ) {
    return this.conversationsService.generatePostDraftImage(user.id, id, dto);
  }
```

- [ ] **Step 9: Run backend tests and build**

Run:

```bash
pnpm --filter @rednote/backend test -- conversations.service.spec.ts
pnpm --filter @rednote/backend test
pnpm --filter @rednote/backend build
```

Expected: PASS for both test commands and build.

- [ ] **Step 10: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations packages/backend/src/conversations packages/backend/src/image-generation
git commit -m "feat: expose post draft image generation"
```

---

### Task 4: Frontend Data Contract And Persistence Helpers

**Files:**
- Modify: `packages/web-frontend/lib/api.ts`
- Modify: `packages/web-frontend/app/workbench/types.ts`
- Modify: `packages/web-frontend/app/workbench/workspace-utils.ts`
- Modify: `packages/web-frontend/app/workbench/workbench-design.test.mjs`

- [ ] **Step 1: Write failing source tests for image state persistence**

Append to `packages/web-frontend/app/workbench/workbench-design.test.mjs`:

```js
test("publish package image fields are mapped and restored", () => {
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");

  for (const field of [
    "imageUrl",
    "imageStatus",
    "imageProvider",
    "imageError",
    "imageGeneratedAt",
  ]) {
    assert.match(api, new RegExp(`${field}[?:]`));
    assert.match(types, new RegExp(`${field}[?:]`));
    assert.match(utils, new RegExp(`${field}:`));
  }

  assert.match(api, /generateImage:/);
  assert.match(api, /\/post-drafts\/\$\{postDraftId\}\/image/);
  assert.match(api, /get: \\(token: string, postDraftId: string\\)/);
});
```

- [ ] **Step 2: Run frontend tests to verify failure**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: FAIL because the fields and API helpers do not exist.

- [ ] **Step 3: Extend backend API types and methods**

Modify `packages/web-frontend/lib/api.ts`. Add fields to `BackendPostDraft`:

```ts
  imageError: string | null;
  imageGeneratedAt: string | null;
  imageProvider: string | null;
  imageStatus: "idle" | "generating" | "ready" | "failed";
  imageUrl: string | null;
```

Add methods under `postDrafts`:

```ts
    get: (token: string, postDraftId: string) =>
      request<BackendPostDraft>(`/post-drafts/${postDraftId}`, {
        token,
      }),
    generateImage: (
      token: string,
      postDraftId: string,
      body: { imagePrompt?: string },
    ) =>
      request<BackendPostDraft>(`/post-drafts/${postDraftId}/image`, {
        body,
        method: "POST",
        token,
      }),
```

- [ ] **Step 4: Extend frontend types**

Modify `packages/web-frontend/app/workbench/types.ts`:

```ts
export type ImageStatus = "idle" | "generating" | "ready" | "failed";
```

Add fields to `PostDraft`:

```ts
  imageError: string | null;
  imageGeneratedAt: string | null;
  imageProvider: string | null;
  imageStatus: ImageStatus;
  imageUrl: string | null;
```

- [ ] **Step 5: Update mappers and snapshot helpers**

Modify `packages/web-frontend/app/workbench/workspace-utils.ts`.

Add helper functions near `isStringArray`:

```ts
function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function imageStatus(value: unknown): PostDraft["imageStatus"] {
  return value === "generating" || value === "ready" || value === "failed"
    ? value
    : "idle";
}
```

Add fields in `mapBackendPostDraft`:

```ts
    imageError: draft.imageError,
    imageGeneratedAt: draft.imageGeneratedAt,
    imageProvider: draft.imageProvider,
    imageStatus: draft.imageStatus,
    imageUrl: draft.imageUrl,
```

Add fields in `getDraftSignature`:

```ts
    imageError: draft.imageError,
    imageGeneratedAt: draft.imageGeneratedAt,
    imageProvider: draft.imageProvider,
    imageStatus: draft.imageStatus,
    imageUrl: draft.imageUrl,
```

Add fields to `mapSavedDraft`, `mapSnapshotPostDraft`, and `mapSnapshotSavedDraft` return objects:

```ts
    imageError: optionalString(snapshot.imageError),
    imageGeneratedAt: optionalString(snapshot.imageGeneratedAt),
    imageProvider: optionalString(snapshot.imageProvider),
    imageStatus: imageStatus(snapshot.imageStatus),
    imageUrl: optionalString(snapshot.imageUrl),
```

Use `value` instead of `snapshot` in `mapSnapshotPostDraft`:

```ts
    imageError: optionalString(value.imageError),
    imageGeneratedAt: optionalString(value.imageGeneratedAt),
    imageProvider: optionalString(value.imageProvider),
    imageStatus: imageStatus(value.imageStatus),
    imageUrl: optionalString(value.imageUrl),
```

- [ ] **Step 6: Run frontend tests**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web-frontend/lib/api.ts packages/web-frontend/app/workbench/types.ts packages/web-frontend/app/workbench/workspace-utils.ts packages/web-frontend/app/workbench/workbench-design.test.mjs
git commit -m "feat: persist publish package image state"
```

---

### Task 5: Publish Package Cover Preview UI

**Files:**
- Create: `packages/web-frontend/app/workbench/post-cover-preview.tsx`
- Modify: `packages/web-frontend/app/workbench/post-editor.tsx`
- Modify: `packages/web-frontend/app/workbench/workbench-design.test.mjs`

- [ ] **Step 1: Write failing UI source tests**

Append to `packages/web-frontend/app/workbench/workbench-design.test.mjs`:

```js
test("post editor presents a focused publish package with image actions", () => {
  const editor = readWorkbenchFile("post-editor.tsx");
  const preview = readWorkbenchFile("post-cover-preview.tsx");

  assert.match(editor, /发布包/);
  assert.match(editor, /PostCoverPreview/);
  assert.match(editor, /onGenerateImage/);
  assert.match(editor, /onDownloadImage/);
  assert.doesNotMatch(editor, /aria-label="局部复制"/);
  assert.match(preview, /imageStatus === "ready"/);
  assert.match(preview, /imageStatus === "failed"/);
  assert.match(preview, /imageStatus === "generating"/);
});
```

- [ ] **Step 2: Run frontend tests to verify failure**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: FAIL because `post-cover-preview.tsx` and new editor props do not exist.

- [ ] **Step 3: Create the cover preview component**

Create `packages/web-frontend/app/workbench/post-cover-preview.tsx`:

```tsx
import { ImageIcon, LoaderCircle, RefreshCcw } from "lucide-react";
import type { PostDraft } from "./types";

type PostCoverPreviewProps = {
  isGeneratingImage: boolean;
  onGenerateImage: () => void;
  postDraft: PostDraft;
};

export function PostCoverPreview({
  isGeneratingImage,
  onGenerateImage,
  postDraft,
}: PostCoverPreviewProps) {
  const imageStatus = isGeneratingImage ? "generating" : postDraft.imageStatus;

  return (
    <section
      className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] p-3"
      aria-label="封面图"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="m-0 text-xs font-bold text-[var(--muted)]">封面图</p>
          <strong className="text-[0.92rem] text-[var(--ink)]">
            {imageStatus === "ready" ? "已生成" : "发布前生成封面"}
          </strong>
        </div>
        <button
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[0.82rem] font-bold text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isGeneratingImage}
          onClick={onGenerateImage}
          type="button"
        >
          {isGeneratingImage ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={15}
              strokeWidth={2.4}
            />
          ) : (
            <RefreshCcw aria-hidden="true" size={15} strokeWidth={2.4} />
          )}
          {postDraft.imageUrl ? "重生成" : "生成图片"}
        </button>
      </div>

      <div className="relative grid aspect-[3/4] min-h-[280px] place-items-center overflow-hidden rounded-md border border-[var(--line)] bg-[#fff8f1]">
        {imageStatus === "ready" && postDraft.imageUrl ? (
          <img
            alt={postDraft.coverLine}
            className="h-full w-full object-cover"
            src={postDraft.imageUrl}
          />
        ) : (
          <div className="grid max-w-[78%] gap-4 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--red-soft)] text-[var(--red-strong)]">
              {imageStatus === "generating" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={24}
                  strokeWidth={2.4}
                />
              ) : (
                <ImageIcon aria-hidden="true" size={24} strokeWidth={2.4} />
              )}
            </span>
            <strong className="text-[1.25rem] leading-tight text-[var(--ink)]">
              {postDraft.coverLine}
            </strong>
            <span className="text-[0.82rem] font-semibold leading-relaxed text-[var(--muted)]">
              {imageStatus === "failed"
                ? postDraft.imageError ?? "封面生成失败，可以重试。"
                : imageStatus === "generating"
                  ? "正在生成封面图"
                  : "这里会显示生成后的封面图"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update the post editor props and imports**

Modify `packages/web-frontend/app/workbench/post-editor.tsx` imports:

```tsx
import { Copy, Download, Save } from "lucide-react";
import { PostCoverPreview } from "./post-cover-preview";
```

Extend `PostEditorProps`:

```ts
  isGeneratingImage: boolean;
  onDownloadImage: () => void;
  onGenerateImage: () => void;
```

Destructure the new props in `PostEditor`:

```tsx
  isGeneratingImage,
  onDownloadImage,
  onGenerateImage,
```

- [ ] **Step 5: Add preview and focused actions**

In the `postDraft ?` branch, place the preview before the fields:

```tsx
          <PostCoverPreview
            isGeneratingImage={isGeneratingImage}
            onGenerateImage={onGenerateImage}
            postDraft={postDraft}
          />
```

Change the panel heading text:

```tsx
            发布包
```

Replace the action area with focused actions:

```tsx
        <div className="grid gap-2" aria-label="发布包操作">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <button
              className={primaryActionClass}
              onClick={() => onCopy(getFullPostText(postDraft), "完整笔记")}
              type="button"
            >
              <Copy aria-hidden="true" size={16} strokeWidth={2.4} />
              复制完整笔记
            </button>
            <button
              className={quietActionClass}
              disabled={!postDraft.imageUrl}
              onClick={onDownloadImage}
              type="button"
            >
              <Download aria-hidden="true" size={16} strokeWidth={2.4} />
              下载图片
            </button>
            <button
              className={quietActionClass}
              disabled={isSavingDraft}
              onClick={onSaveDraft}
              type="button"
            >
              <Save aria-hidden="true" size={16} strokeWidth={2.4} />
              {isSavingDraft ? "保存中" : "保存草稿"}
            </button>
          </div>
          {draftStale ? (
            <p className="m-0 text-[0.8rem] font-semibold leading-relaxed text-[var(--muted)]">
              大纲已调整，需要新版内容时请回到大纲区重新生成。
            </p>
          ) : null}
        </div>
```

Remove the old `<div className="flex flex-wrap gap-2" aria-label="局部复制">` block.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web-frontend/app/workbench/post-cover-preview.tsx packages/web-frontend/app/workbench/post-editor.tsx packages/web-frontend/app/workbench/workbench-design.test.mjs
git commit -m "feat: add publish package cover preview"
```

---

### Task 6: Frontend Image Generation And Download Flow

**Files:**
- Modify: `packages/web-frontend/app/page.tsx`
- Modify: `packages/web-frontend/app/workbench/workspace-utils.ts`
- Modify: `packages/web-frontend/app/workbench/workbench-design.test.mjs`

- [ ] **Step 1: Write failing source tests for page flow**

Append to `packages/web-frontend/app/workbench/workbench-design.test.mjs`:

```js
test("page merges generated image fields without overwriting local copy", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");

  assert.match(source, /async function generateImage/);
  assert.match(source, /function mergePostDraftImageFields/);
  assert.match(source, /api\.postDrafts\.generateImage/);
  assert.match(source, /await flushPostDraftPatch\(\)/);
  assert.match(source, /onGenerateImage=\{generateImage\}/);
  assert.match(source, /onDownloadImage=\{downloadImage\}/);
});
```

- [ ] **Step 2: Run frontend tests to verify failure**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: FAIL because `generateImage`, `downloadImage`, and image merge helpers do not exist.

- [ ] **Step 3: Add image-field merge helper**

Modify imports in `packages/web-frontend/app/page.tsx` if needed to include `ImageStatus`:

```ts
  ImageStatus,
```

Add a helper near `getWorkspaceErrorMessage`:

```ts
function mergePostDraftImageFields(
  current: PostDraft,
  next: PostDraft,
): PostDraft {
  return {
    ...current,
    imageError: next.imageError,
    imageGeneratedAt: next.imageGeneratedAt,
    imageProvider: next.imageProvider,
    imagePrompt: next.imagePrompt,
    imageStatus: next.imageStatus,
    imageUrl: next.imageUrl,
  };
}
```

- [ ] **Step 4: Add image generation state**

Add state next to `isGenerating`:

```ts
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
```

Include it in `useWorkspaceAutosave` pause conditions by passing the existing `isGenerating` value as:

```ts
    isGenerating: isGenerating || isGeneratingImage,
```

- [ ] **Step 5: Add `generateImage`**

Add this function near `confirmOutline`:

```ts
  async function generateImage() {
    if (isGeneratingImage) return;
    if (!postDraft) return;
    if (!accessToken) {
      setStatusMessage("请先登录，再生成封面图。");
      return;
    }

    const draftId = postDraft.id;
    setIsGeneratingImage(true);
    setPostDraft((draft) =>
      draft && draft.id === draftId
        ? {
            ...draft,
            imageError: null,
            imageStatus: "generating" as ImageStatus,
          }
        : draft,
    );

    try {
      await flushPostDraftPatch();
      const updated = await api.postDrafts.generateImage(accessToken, draftId, {
        imagePrompt: postDraft.imagePrompt,
      });
      const mappedDraft = mapBackendPostDraft(updated);

      setPostDraft((current) =>
        current && current.id === mappedDraft.id
          ? mergePostDraftImageFields(current, mappedDraft)
          : current,
      );
      setStatusMessage("封面图已生成，可以下载或继续调整文案。");
      await refreshConversationRecordsSafely(
        "封面图已生成，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setPostDraft((draft) =>
        draft && draft.id === draftId
          ? {
              ...draft,
              imageError: getWorkspaceErrorMessage(error, "封面图生成失败。"),
              imageStatus: "failed" as ImageStatus,
            }
          : draft,
      );
      setStatusMessage(
        getWorkspaceErrorMessage(error, "封面图生成失败，文案已保留。"),
      );
    } finally {
      setIsGeneratingImage(false);
    }
  }
```

- [ ] **Step 6: Add `downloadImage`**

Add this function near `copyText`:

```ts
  function downloadImage() {
    if (!postDraft?.imageUrl) {
      setStatusMessage("还没有可下载的封面图。");
      return;
    }

    const link = document.createElement("a");
    link.href = postDraft.imageUrl;
    link.download = `${postDraft.title || "rednote-cover"}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatusMessage("封面图已开始下载。");
  }
```

- [ ] **Step 7: Pass props into `PostEditor`**

Find the `<PostEditor` call in `packages/web-frontend/app/page.tsx` and add:

```tsx
          isGeneratingImage={isGeneratingImage}
          onDownloadImage={downloadImage}
          onGenerateImage={generateImage}
```

- [ ] **Step 8: Run frontend tests**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/workbench/workspace-utils.ts packages/web-frontend/app/workbench/workbench-design.test.mjs
git commit -m "feat: wire publish package image actions"
```

---

### Task 7: Full Verification And UI Review

**Files:**
- Verify all changed files.
- No planned source changes in this task unless verification exposes a concrete defect.

- [ ] **Step 1: Run backend tests**

Run:

```bash
pnpm --filter @rednote/backend test
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
pnpm --filter @rednote/backend build
```

Expected: PASS and Prisma client generation succeeds.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
pnpm --filter @rednote/web-frontend test
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```bash
pnpm --filter @rednote/web-frontend build
```

Expected: PASS.

- [ ] **Step 6: Run the full app**

Run:

```bash
pnpm dev
```

Expected:

- Backend starts with `Found 0 errors`.
- Frontend starts on `http://localhost:3000` or the next available port.
- No Prisma client export errors.

- [ ] **Step 7: Manual browser verification**

In the in-app browser:

1. Open `http://localhost:3000`.
2. Log in with the existing demo or registered account path.
3. Enter an idea such as `小红书新手如何把周末备餐做得好看又省心`.
4. Generate outlines.
5. Select one outline and generate the publish package.
6. Confirm the right panel shows publish-ready text and an idle cover preview.
7. Click generate image.
8. Confirm a cover image appears.
9. Click copy full text and confirm the status message says it copied.
10. Click save draft.
11. Reload the page or switch conversation records.
12. Confirm the restored workspace includes text and the image state.

- [ ] **Step 8: Run an impeccable UI critique**

Use `$impeccable` against the running frontend and inspect the publish package panel for:

- Visual overload.
- Xiaohongshu creator atmosphere.
- Duplicate buttons.
- Tooltip layering.
- Mobile text overflow.
- Whether the generated output looks ready to publish.

If critique finds a P1 or P2 issue, fix it with a focused commit and re-run the relevant tests plus browser verification.

- [ ] **Step 9: Final commit if verification required polish**

Only run this commit if Step 8 required source changes:

```bash
git add packages/backend packages/web-frontend
git commit -m "fix: polish publish package image flow"
```

Expected: commit is created only when there are verification fixes.

- [ ] **Step 10: Report completion**

Final response should include:

- Implemented backend mock image generation and publish package fields.
- Implemented frontend publish package preview/actions.
- Verification commands and results.
- Browser screenshot path if captured.
- Any remaining limitation: v1 uses mock SVG data URLs, real provider integration is outside this implementation.
