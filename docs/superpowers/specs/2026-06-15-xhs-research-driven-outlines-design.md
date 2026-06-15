# XHS Research Driven Outlines Design

Date: 2026-06-15

## Purpose

Upgrade the main creator workflow from generic outline generation to
research-backed outline generation.

The creator should only enter one idea. RedNote then breaks the idea into
search keywords, searches Xiaohongshu for popular notes through the configured
connector, analyzes the samples' hooks and outline structures, summarizes the
platform patterns, and generates three outline candidates based on that
research.

This makes the first important result feel grounded in current platform
signals instead of like a generic AI answer.

## Scope

This increment changes the outline generation path for the user-facing
workbench.

In scope:

- Add an idea-to-keyword research step.
- Add a connector contract for keyword search.
- Search popular Xiaohongshu notes by keyword.
- Normalize and deduplicate searched posts.
- Save standardized sample data to the conversation.
- Analyze hooks, outline patterns, tag patterns, content angles, and avoid
  patterns.
- Return a compact research summary plus three outline candidates.
- Show the research summary above the outline candidates.
- Keep TikHub configuration available, but make the new research flow prefer
  the custom connector described in `docs/xhs-connector-analysis.md`.

Out of scope:

- Direct NestJS integration with `Spider_XHS` or `XHS_ALL_IN_ONE`.
- A global content library.
- User selection of individual searched notes.
- Full raw-note display in the user interface.
- Background job queues.
- Direct Xiaohongshu publishing.
- Automatic fallback from custom connector to TikHub.

## Existing Ground

The project already has:

- Admin content provider configuration for `tikhub` and `custom`.
- A documented recommendation to build a separate Xiaohongshu connector
  service and access it through `custom`.
- Manual import endpoints for single notes and accounts.
- `@rednote/agent/xhs-analysis` helpers for post/account analysis, generation
  briefs, outline candidates, and publish packages.
- Conversation-scoped persistence for imported references.
- A web workbench that generates outline batches and keeps previous batches.

The missing piece is a first-class research operation that starts from the
creator's idea and automatically gathers popular samples before generating
outlines.

## User Flow

The default workbench flow becomes:

1. User enters an idea.
2. User clicks the primary outline action.
3. RedNote runs `quick` research by default.
4. The backend extracts 3-5 search keywords.
5. The backend calls the custom Xiaohongshu connector for popular notes.
6. The backend analyzes and saves standardized samples.
7. The frontend shows a compact research summary.
8. The frontend shows three research-backed outline candidates.
9. User edits or selects an outline.
10. User generates the final publish package.

The UI should still feel like a focused creator workbench. It should not become
a search-console product. The research summary is evidence and guidance, not a
second workspace.

## Research Modes

`quick` is the default mode:

- 3-5 keywords.
- Top 5 notes per keyword.
- Expected 15-25 raw samples before deduplication.
- Used for normal outline generation.

`deep` is available as an explicit mode:

- 5-8 keywords.
- Top 10 notes per keyword.
- Expected 50-80 raw samples before deduplication.
- Used when the user wants stronger platform research.

The first implementation can keep both modes synchronous with controlled
provider concurrency. If deep mode becomes too slow in practice, it can later
move to a background task without changing the research record shape.

## Connector Contract

The new flow uses the custom connector first. TikHub remains configurable for
older import flows and future compatibility, but this research endpoint should
not silently fall back to TikHub. If `custom` is not configured or has no enabled
API key, the backend returns a clear setup error.

Add this custom connector endpoint:

```http
POST /xhs/posts/search
Authorization: Bearer <apiKey>
Content-Type: application/json
```

Request:

```json
{
  "keyword": "通勤穿搭",
  "limit": 5,
  "sort": "popular"
}
```

Response:

```json
{
  "data": {
    "keyword": "通勤穿搭",
    "posts": [
      {
        "note_id": "xxx",
        "note_url": "https://www.xiaohongshu.com/explore/xxx",
        "title": "标题",
        "content": "正文",
        "author_id": "author-id",
        "author_name": "作者",
        "author_avatar": "https://...",
        "cover_url": "https://...",
        "image_urls": ["https://..."],
        "video_url": "",
        "likes": 1200,
        "collects": 800,
        "comments": 90,
        "shares": 50,
        "tags": ["通勤穿搭"],
        "raw": {}
      }
    ]
  }
}
```

The backend should tolerate `data.posts`, `data.items`, or `data.notes` if the
connector needs a slightly different wrapper, but the normalized internal
sample shape should remain stable.

## Backend Design

Add a new conversation-scoped model, tentatively `XhsResearchRun`:

- `id`
- `conversationId`
- `idea`
- `mode`: `quick | deep`
- `keywords`: JSON string array
- `providerType`: expected `custom` for this flow
- `sampleCount`
- `samples`: JSON string of standardized samples
- `analysis`: JSON string of per-sample and aggregate analysis
- `summary`: JSON string of the research summary returned to the frontend
- `status`: `completed | failed`
- `errorMessage`
- `createdAt`
- `updatedAt`

Add relation from `Conversation` to `XhsResearchRun` with cascade delete.

Add protected endpoint:

```http
POST /xhs-analysis/research/outlines
```

Request:

```json
{
  "conversationId": "conversation-id",
  "idea": "我想写一篇适合小个子女生的通勤穿搭",
  "mode": "quick"
}
```

Response:

```json
{
  "research": {
    "id": "research-id",
    "idea": "我想写一篇适合小个子女生的通勤穿搭",
    "mode": "quick",
    "keywords": ["小个子通勤穿搭", "职场穿搭", "显高穿搭"],
    "sampleCount": 15,
    "summary": {
      "hookPatterns": [],
      "outlinePatterns": [],
      "tagPatterns": [],
      "contentAngles": [],
      "avoidPatterns": []
    }
  },
  "outlines": []
}
```

The endpoint owns the full research pipeline:

1. Verify the conversation belongs to the current user.
2. Normalize and validate the idea.
3. Resolve the `custom` content provider runtime config.
4. Build keywords from the idea and mode.
5. Call `/xhs/posts/search` for each keyword with controlled concurrency.
6. Normalize, deduplicate, and rank returned samples.
7. Analyze popular sample hooks and structures.
8. Build three outline candidates from the research summary.
9. Persist the research run.
10. Create an `OutlineBatch` linked to the conversation.
11. Return research summary and the newly created outlines.

If some keyword searches fail but enough samples remain, the endpoint should
complete and include warnings in the summary. If all keyword searches fail, it
should fail with a clear provider error.

## Agent Design

Extend `@rednote/agent/xhs-analysis` with pure helpers:

- `buildXhsSearchKeywords(input)`
- `analyzeXhsPopularSamples(input)`
- `buildXhsResearchBackedOutlines(input)`

Suggested types:

```ts
export type XhsResearchMode = 'quick' | 'deep';

export interface XhsSearchKeywordPlan {
  idea: string;
  keywords: string[];
  mode: XhsResearchMode;
}

export interface XhsPopularSampleAnalysis {
  hookPatterns: string[];
  outlinePatterns: string[];
  tagPatterns: string[];
  contentAngles: string[];
  avoidPatterns: string[];
  standoutSamples: Array<{
    reason: string;
    title: string;
    url?: string;
  }>;
}
```

The first version should be deterministic and rule-based:

- Extract keyword candidates from idea nouns, pain points, audiences, and
  scenarios.
- Expand with Xiaohongshu-friendly suffixes such as `攻略`, `避坑`, `清单`,
  `教程`, `测评`, and `经验`.
- Rank samples by weighted engagement:
  `likes + collects * 1.4 + comments * 1.8 + shares * 1.6`.
- Infer hook patterns from title and opening content.
- Infer outline patterns from numbered phrases, list markers, images count,
  and repeated section language.

Later, this can be upgraded to use the configured text model for richer
summary generation, but the pure helper should stay as the fallback and testable
baseline.

## Frontend Design

Change the outline generation action from generic generation to research-backed
generation.

Visible changes:

- Primary button copy can become `研究并生成大纲`.
- Add a compact research summary band above outline batches.
- Show:
  - keywords
  - analyzed sample count
  - top hook patterns
  - common outline structures
  - tag directions
  - avoid patterns
- Keep complete raw samples hidden in the first version.

The existing outline editing, batch history, selected outline, and publish
package generation flow should remain intact.

When the user clicks `换一批`, the system should keep old outline batches and
run a new research-backed outline batch for the current idea. This preserves the
existing "keep previous generated outlines" behavior.

## Persistence And Restore

When opening an existing conversation, the frontend should restore the latest
research summary along with outlines. It does not need to load or render all raw
samples.

Snapshots can continue to store the visible workspace state, but
`XhsResearchRun` is the durable backend source for research records.

## Error Handling

Provider configuration errors:

- If custom provider is disabled or missing an enabled API key, return a clear
  setup message: `请先在后台配置小红书连接器。`

Search failures:

- If one keyword fails, continue with remaining keywords and include a warning.
- If all keywords fail, do not create outlines from empty research.

Low sample count:

- If fewer than 6 samples remain after deduplication, return a warning and
  still generate outlines if at least 3 usable samples remain.
- If fewer than 3 usable samples remain, ask the user to adjust the idea or
  check connector availability.

Compliance:

- Do not display full copied raw content in the UI by default.
- Save source URLs and standardized metadata for traceability.
- Keep connector Cookie/private protocol concerns outside NestJS.

## Testing

Agent:

- Keyword extraction returns mode-appropriate keyword counts.
- Sample analysis deduplicates and ranks popular notes.
- Research-backed outline generation always returns three candidates.
- Empty or weak samples produce explicit avoid/fallback patterns.

Backend:

- Research endpoint requires authentication and conversation ownership.
- Missing custom provider returns the setup error.
- Search requests call `/xhs/posts/search` with the configured API key.
- Partial keyword failures still produce a completed research run when enough
  samples remain.
- All keyword failures do not create an outline batch.
- Research runs are persisted and cascade with conversation deletion.

Frontend:

- Workbench calls the new research endpoint for outline generation.
- Research summary renders without showing full raw note content.
- `换一批` keeps previous batches and refreshes the research summary.
- Restored conversations show the latest research summary.

## Rollout

1. Add agent types and pure research helpers.
2. Add backend Prisma model and migration.
3. Add provider search normalization utility.
4. Add `POST /xhs-analysis/research/outlines`.
5. Update frontend API client.
6. Update workbench outline generation to call the research endpoint.
7. Add the compact research summary UI.
8. Keep manual reference import available as an advanced secondary path.

## Open Decisions Locked For This Spec

- Default research mode is `quick`.
- Deep mode exists as an explicit user choice.
- First UI shows research summary, not the raw sample list.
- Standardized sample data is persisted in the backend.
- The research flow requires the custom connector and does not silently fall
  back to TikHub.
- NestJS backend does not directly import Spider_XHS or XHS_ALL_IN_ONE.
