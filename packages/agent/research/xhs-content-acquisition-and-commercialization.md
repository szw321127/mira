# Xiaohongshu Content Acquisition And Productization Notes

Date: 2026-06-10

This note records the repository research and the implementation boundary for
RedNote account/post analysis. It is intentionally stored under
`packages/agent` because the current task limits product code changes outside
the agent package.

## Repository Sample

GitHub search for `小红书` returned thousands of repositories. The relevant
content-acquisition samples fall into these groups:

| Repository                                                                                | Main Method                                                                                                                                       | Useful Signal For RedNote                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)                     | Playwright login state + signed web API requests to Xiaohongshu endpoints such as search, feed detail, comments, creator profile, creator notes.  | Best map of data fields and workflows, but license and anti-bot mechanics make direct reuse unsuitable for this commercial project. |
| [yangsijie666/xiaohongshu-crawler](https://github.com/yangsijie666/xiaohongshu-crawler)   | Playwright DOM collection with saved auth state, stealth context, search result parsing, detail parsing, and comment scrolling.                   | Good model for a bring-your-own-browser collector and MCP-style session boundary.                                                   |
| [mcxiaoxiao/xiaohongshuCrawler](https://github.com/mcxiaoxiao/xiaohongshuCrawler)         | Tampermonkey extracts IDs/titles/media on the page, then Python requests public note pages and reads meta description.                            | Lightweight manual-assisted import path; lower automation risk but limited data depth.                                              |
| [TikHub/TikHub-API-Python-SDK](https://github.com/TikHub/TikHub-API-Python-SDK)           | Third-party API SDK exposing Xiaohongshu web/app endpoints for note info, comments, user info, user notes, search, share-link extraction, images. | Clean product integration option if users bring an API key and accept provider terms/cost.                                          |
| [Xiangyu-CAS/xiaohongshu-ops-skill](https://github.com/Xiangyu-CAS/xiaohongshu-ops-skill) | Operational SOP over browser actions: account analysis, feed analysis, viral-copy, publish flow, comment operations, knowledge-base persistence.  | Strong product workflow reference for account diagnosis and viral post deconstruction.                                              |
| [comeonzhj/Auto-Redbook-Skills](https://github.com/comeonzhj/Auto-Redbook-Skills)         | Skill-driven note creation, card/cover rendering, and publishing automation.                                                                      | Useful image-text package structure: cover plus multiple cards/pages.                                                               |
| [whotto/Video_note_generator](https://github.com/whotto/Video_note_generator)             | Video/subtitle ingestion, AI restructuring, optional image sourcing, Xiaohongshu output format.                                                   | Useful expansion path from raw material to platform-native publish packages.                                                        |
| [upJiang/jiang-xiaohongshu-crawler](https://github.com/upJiang/jiang-xiaohongshu-crawler) | Puppeteer crawler plus AI analysis/export workflow.                                                                                               | Confirms the commercial UI shape: collect, deduplicate/export, analyze, generate insights.                                          |

## Acquisition Patterns

1. Signed web API with cookies

- Uses a real browser session to obtain cookies such as `web_session`.
- Calls Xiaohongshu web endpoints for search, feed detail, comments, and creator
  notes.
- Requires request signatures (`x-s`, `x-t`, `x-s-common`, trace id) and tokens
  such as `xsec_token`.
- Pros: structured data and higher fidelity.
- Cons: brittle, platform-policy risk, anti-bot maintenance, and often
  non-commercial or research-only licensing.

2. Browser DOM collection

- Opens Xiaohongshu pages with Playwright/Selenium/DrissionPage/Puppeteer.
- Saves browser auth state and extracts visible cards/details/comments from DOM.
- Uses infinite scroll and randomized delays.
- Pros: easier to reason about and can be user-assisted.
- Cons: selectors break, login/captcha still required, and scraping volume must
  remain controlled.

3. Manual-assisted page extraction

- Browser extension/userscript extracts current-page note IDs, titles, images,
  or profile links.
- A local script converts the pasted/exported list into structured samples.
- Pros: smallest risk and easiest MVP import.
- Cons: relies on user action and shallow data.

4. Third-party provider API

- User supplies a provider API key.
- Product calls provider endpoints for note/user/search/comment/image data.
- Pros: clean backend integration and predictable API contract.
- Cons: cost, vendor dependency, data rights and availability are delegated to
  the provider.

## Recommended Product Boundary

For RedNote, the safer commercial path is:

1. Accept structured Xiaohongshu samples from user import, browser-assisted
   collection, or configured third-party providers.
2. Keep the backend analysis domain independent from any specific crawler.
3. Add provider adapters later behind explicit admin configuration and clear
   rate limits.
4. Do not copy signing algorithms, stealth scripts, or crawler code from
   research-only repositories.

This lets the product deliver account/post analysis and better generation
without making the first commercial release depend on fragile scraping.

## Current Backend Domain Implementation

Implemented in `packages/backend/src/xhs-analysis/domain`:

- `normalizeXhsCount`: converts Xiaohongshu count text like `1.2万` and `3.5w`.
- `analyzeXhsPost`: turns one structured note into format, engagement,
  content-angle, viral-signal, tag-pattern, and generation-hint data.
- `analyzeXhsAccount`: analyzes recent posts into account snapshot, content
  pillars, top posts, and next actions.
- `normalizeXhsImportedPosts`: normalizes already-acquired note data from
  provider APIs, browser-assisted collection, or manual paste/export into
  `XhsPostInput[]`. It also records source metadata and drops duplicates.
- `normalizeXhsImportedAccount`: normalizes an already-acquired account/profile
  payload and its note list into `XhsAccountInput`, keeping source provenance.
- `buildXhsGenerationBrief`: converts reference post analyses into prompt
  additions and recommended image-text sections without copying source content.
- `buildXhsOutlineCandidates`: returns three editable Xiaohongshu image-text
  outline candidates for one idea:
  - pain-point
  - step-by-step
  - checklist
- `buildXhsImageTextPublishPackage`: converts an idea, optional outline, and
  reference brief into a Xiaohongshu-style publish package:
  - title candidates
  - cover page
  - content pages
  - summary page
  - caption
  - hashtags
  - per-page image prompts
  - copy-ready publish text
  - publishing checklist
- `auditXhsImageTextPublishPackage`: checks whether a publish package is ready
  for commercial product use. It returns:
  - readiness boolean
  - numeric score
  - passed checks
  - blockers
  - warnings
  - repair actions
- `buildXhsCommercialWorkflow`: composes import normalization, account/post
  analysis, reference brief generation, publish package construction, and
  readiness audit into one backend-friendly workflow.

Exports were added from `packages/agent/src/index.ts` so backend/product layers
can import these primitives later.

## Import Normalization Boundary

The product should separate acquisition from analysis:

- Acquisition layer: user paste/export, browser-assisted collector, or
  configured third-party provider.
- Normalization layer: `normalizeXhsImportedPosts` and
  `normalizeXhsImportedAccount`.
- Analysis layer: `analyzeXhsPost`, `analyzeXhsAccount`, and
  `buildXhsGenerationBrief`.
- Outline layer: `buildXhsOutlineCandidates`.
- Generation layer: `buildXhsImageTextPublishPackage` and
  `auditXhsImageTextPublishPackage`.

This keeps crawler/provider volatility out of the core agent logic. Each
backend adapter only needs to map its raw payload into a
`XhsImportedPostRecord` or `XhsImportedAccountRecord`:

```ts
normalizeXhsImportedPosts([
  {
    source: 'provider',
    sourceId: 'tikhub-note-123',
    raw: providerPayload,
  },
]);
```

The normalizer handles common field aliases such as:

- note IDs: `note_id`, `noteId`, `id`, `item_id`
- text: `title`, `desc`, `description`, `content`
- media: `images`, `imageUrls`, `images_list`, `cover`
- metrics: `liked_count`, `collected_count`, `comment_count`, `share_count`
- tags: `tags`, `tag_list`, hashtag strings
- authors: `author`, `nickname`, `user.nickname`

It intentionally does not fetch, sign, scroll, bypass captcha, or automate
publishing. Those concerns belong to explicit adapters with user/admin
configuration and compliance controls.

## Commercial Workflow Contract

The recommended product flow is:

1. User enters an idea.
2. Backend runs `buildXhsOutlineCandidates` and returns exactly three editable
   outline candidates.
3. User edits or selects one candidate.
4. Backend runs `buildXhsCommercialWorkflow` with the selected outline.
5. Frontend renders the structured publish package and audit state.

Recommended outline API shape:

- `POST /xhs/outlines`
- Request body:
  - `idea`
  - `audience`
  - optional `brief` if references were already analyzed
- Response body:
  - wrapped in `{ code, data, msg }`
  - `data.candidates` should contain three `XhsOutlineCandidate` records

For the first backend integration, prefer one composed workflow endpoint before
splitting the internals into many UI-facing calls:

```ts
buildXhsCommercialWorkflow({
  account: optionalImportedAccount,
  posts: optionalImportedReferencePosts,
  idea: userIdea,
  audience,
  outline: selectedOutline,
  pageCount: 5,
});
```

The workflow returns:

- normalized standalone post imports
- optional normalized account import
- account analysis
- deduplicated reference post analyses
- generation brief
- structured publish package
- publish readiness audit
- compact summary for UI badges and backend logs

Recommended API shape:

- `POST /xhs/workflows/commercial-draft`
- Request body:
  - `idea`
  - `audience`
  - `outline`
  - `accountImport`
  - `postImports`
  - `pageCount`
  - `tone`
- Response body:
  - wrapped in the existing `{ code, data, msg }` envelope
  - `data.workflow` should be the full workflow result
  - persist `data.workflow.publishPackage` and `data.workflow.audit`

The workflow can power a mature commercial loop:

1. Generate outlines.
2. User selects/edits one outline.
3. Import account or reference notes.
4. Run `buildXhsCommercialWorkflow`.
5. If `audit.ready` is false, use `repairActions` for automatic model repair.
6. If ready, show editable publish package and copy/export controls.

## Publish Package Contract

The frontend should not treat image-text generation as one long assistant reply.
The commercial product should persist and render a structured publish package.

Recommended lifecycle:

1. User enters an idea.
2. Backend generates or receives three outlines.
3. User edits and selects an outline.
4. Backend analyzes selected reference notes or account samples with
   `analyzeXhsPost` / `analyzeXhsAccount`.
5. Backend builds a `XhsGenerationBrief`.
6. Backend generates or refines final copy with the model, then normalizes the
   result through `buildXhsImageTextPublishPackage`.
7. Frontend renders pages as editable cards:
   - cover
   - P2-PN content pages
   - summary/interact page
   - caption and hashtags
   - image prompt pack
   - copy/export actions

Storage should preserve the full publish package JSON so conversation restore
can bring back the exact selected outline, generated pages, edits, caption,
hashtags, and image prompts.

The current agent package produces deterministic scaffold content. Production
model output can replace or enrich page bodies later, but should keep the same
contract so API consumers and saved conversation records stay stable.

## Publish Quality Gate

Before showing final output as ready to copy or export, backend should run
`auditXhsImageTextPublishPackage`.

Recommended gate:

- `ready = true`: allow copy/export, still let the user edit every field.
- `ready = false` with blockers: show repair actions and trigger a model repair
  pass before presenting the result as final.
- warnings only: show non-blocking suggestions in the editor.

The first production gate should require:

- cover page exists and has a meaningful headline
- 4-7 image-text pages
- each page has headline, body, and image prompt
- publish text includes title, caption, and hashtags
- caption has concrete steps and light interaction
- at least 3 hashtags covering audience, scene, and category

This keeps the product from shipping prompt-like intermediate text as if it were
publish-ready Xiaohongshu content.

## Future Product Work

### Backend

- Add `xhs-analysis` module with endpoints:
  - `POST /xhs-analysis/posts/analyze`
  - `POST /xhs-analysis/accounts/analyze`
  - `POST /xhs-analysis/generation-brief`
- Persist imported samples, analyses, and source metadata.
- Add provider config later:
  - manual import
  - browser-assisted import
  - TikHub-compatible provider

### Web Frontend

- Add an "inspiration/reference" panel in the creator workbench.
- Let users paste a note URL, upload exported samples, or select saved
  reference posts.
- Show analysis results as account pillars, viral signals, and generation
  guidance.
- Feed selected references into outline/post generation.
- Render final output as a publish package, not as a prompt-like intermediate
  structure.

### Admin

- Add content-provider settings only after backend adapter shape is stable:
  provider type, base URL, API key keyring, rate limits, and compliance copy.

### Publish Package

- Move from one cover preview to a publish package model closer to Xiaohongshu
  image-text posts:
  - cover page
  - 3-6 content pages
  - caption/body
  - tags
  - image/page prompts
  - copy/download/export actions

Any UI changes should go through impeccable review before commit.
