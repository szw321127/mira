# Mira Image Agent Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Mira image agent workspace where logged-in users can generate images, place them on an infinite canvas, edit selected images, keep version history, and inspect task progress without exposing raw tool results.

**Architecture:** Keep image work separate from the text chat transcript. The backend owns workspace metadata, provider calls, storage, task execution, auth, quotas, and admin-configured secrets; the frontend owns the tool UI, tldraw canvas interaction, optimistic task state, selection, drawers, and user-readable errors. PostgreSQL stores durable metadata, Redis stores queue/progress state, and object storage stores image binaries.

**Tech Stack:** NestJS, Prisma 7, PostgreSQL, Redis, Next 16 App Router, React 19, Tailwind 4, tldraw, lucide-react, OpenAI image APIs, Alibaba Cloud OSS or S3-compatible object storage, Node test runner, Jest.

---

## Scope

The design spec is saved at `docs/superpowers/specs/2026-06-23-mira-image-agent-canvas-design.md`.

## Plan Status

This plan is now the persisted implementation handoff for the Mira image agent canvas work.

- Spec: `docs/superpowers/specs/2026-06-23-mira-image-agent-canvas-design.md`
- Plan: `docs/superpowers/plans/2026-06-23-mira-image-agent-canvas.md`
- Branch: `master`
- Last updated: 2026-06-23

Current execution state: core workspace, canvas, provider/storage, queue/worker, streaming, masks, versioned edits, upscale/background removal, usage accounting, and deployment topology are implemented in the working tree. The feature is not ready to mark complete until the remaining verification gates pass: real provider/storage smoke checks, Docker compose validation in an environment with Docker, live deployment smoke, and final completion audit.

## Current Landing Plan

This is the practical continuation plan for the next worker. Treat the source implementation as substantially built, but not production-proven.

## Persisted Execution Runbook

This section is the short, durable plan to follow from the current working tree. It exists so the next worker does not need to reconstruct the landing path from the long execution log below.

**Decision:** keep the image workspace implementation in this repository and finish it through verification, deployment, and live canary instead of starting another branch or rewriting the feature. The code is already organized around a dedicated `/image-workspace` frontend route, a NestJS `image-workspaces` backend module, Prisma image models, Redis-backed task execution, admin-managed runtime secrets, and object storage abstractions.

**Do first:**

1. OpenAI image provider compatibility is now handled through Vercel AI SDK instead of hand-written OpenAI HTTP request code. `packages/backend/src/image-workspaces/openai-image-provider.service.ts` uses `createOpenAI({ apiKey })` plus `generateImage()` for both text-to-image and `{ text, images, mask }` edits, so the SDK owns `/images/generations` JSON and `/images/edits` multipart request construction.
2. Re-run the local proof gates after any provider or worker fix:

```bash
pnpm --filter @rednote/backend test -- openai-image-provider image-worker image-worker-edit image-assets image-workspaces.service
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
node --test scripts/image-workspace-smoke.test.mjs
git diff --check
```

3. Only after the user asks for landing, commit and push the whole feature set from `master`, then let the existing GitHub Actions deployment build fresh backend/frontend images.
4. On the server, prove the deployed stack is the new one:

```bash
docker compose config --quiet
docker compose ps
docker compose logs --tail=120 backend
docker compose logs --tail=120 worker
curl -I http://127.0.0.1:3000/image-workspace
curl -I http://127.0.0.1:4000/health
```

5. Run the authenticated real-provider smoke from a machine with the repository checkout and a real logged-in Mira user cookie:

```bash
APP_ORIGIN="https://<production-domain-or-ip>" \
MIRA_USER_COOKIE="<logged-in-user-cookie>" \
MIRA_SMOKE_SOURCE_IMAGE="/absolute/path/to/source.png" \
node scripts/image-workspace-smoke.mjs
```

6. Finish with a manual browser canary: log in as a normal user, open `/image-workspace`, create a workspace, generate one cheap image, drag it, refresh to confirm canvas persistence, draw a mask edit, compare versions, download a version, delete an asset, and verify the UI never exposes `storageKey`, `maskKey`, `providerJob`, `tool_call`, `tool_result`, or `b64_json`.

**Do not mark the active goal complete until every command/canary above is recorded green in this plan.**

Latest green verification from the Vercel AI SDK image provider continuation:

```bash
pnpm --filter @rednote/backend test -- openai-image-provider
pnpm --filter @rednote/backend test -- openai-image-provider image-worker image-worker-edit image-assets image-usage
pnpm --filter @rednote/backend exec tsc -p tsconfig.build.json --noEmit
pnpm build:backend
pnpm test:backend
git diff --check -- packages/backend/src/image-workspaces/openai-image-provider.service.ts packages/backend/src/image-workspaces/openai-image-provider.service.spec.ts docs/superpowers/plans/2026-06-23-mira-image-agent-canvas.md
```

Red result before implementation: `openai-image-provider` failed because the service still sent edits as JSON with `Content-Type: application/json`, while the SDK-backed expectation uses `generateImage()` with an edit prompt and lets `@ai-sdk/openai` send multipart `FormData` without manually setting `Content-Type`.

Green result after implementation: focused provider tests passed 5/5, related backend image suites passed 55/55, backend TypeScript no-emit passed, backend production build completed successfully, full backend tests passed 37/37 suites and 220/220 tests, and targeted `git diff --check` produced no output. The backend test log still includes the expected `database unavailable` message from an error-handling test, with Jest exit code 0.

Latest full local proof gates after the SDK provider continuation:

```bash
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
node --test scripts/image-workspace-smoke.test.mjs
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
docker --version
docker compose version
```

Result: backend tests passed 37/37 suites and 220/220 tests; frontend tests passed 111/111; backend and frontend production builds completed successfully; the frontend route summary includes `○ /image-workspace`; smoke script structure tests passed 4/4; `git diff --check` produced no output; the untracked-file conflict/trailing-whitespace scan found no matches. Docker CLI validation is still unavailable in the current local environment because both Docker commands returned `command not found`.

1. **Keep the work on `master`.** The user explicitly prefers future changes directly on `master`. Do not create a new branch unless the user changes that preference.
2. **Do not revert unrelated dirty files.** The working tree contains intentional image-workspace, admin, deploy, and auth changes.
3. **Finish the real smoke runbook first.** The smoke script lives at `scripts/image-workspace-smoke.mjs` and is documented in `.github/CICD.md`. It must prove source upload, preview, generate, mask upload, edit, variation, upscale, background removal, and download against the deployed app.
4. **Deploy only after explicit user approval.** The current live server previously returned `404` for `/image-workspace` because the deployed frontend image did not include this uncommitted worktree.
5. **After deployment, run these gates in order:**

```bash
node --test scripts/image-workspace-smoke.test.mjs
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Then run on a Docker-capable machine or server:

```bash
docker compose config --quiet
docker compose ps
```

Then run the authenticated real-provider smoke:

```bash
APP_ORIGIN="https://<production-domain-or-ip>" \
MIRA_USER_COOKIE="<logged-in-user-cookie>" \
MIRA_SMOKE_SOURCE_IMAGE="/absolute/path/to/source.png" \
node scripts/image-workspace-smoke.mjs
```

6. **Manual canary after the script:** open `/image-workspace`, log in as a normal user, verify desktop and mobile layouts, create one cheap image, drag it on canvas, refresh, draw a mask edit, compare versions, download a version, delete an asset, and confirm no visible raw `storageKey`, `maskKey`, `providerJob`, `tool_call`, `tool_result`, or `b64_json`.

Completion rule: only mark this feature complete after the automated tests/builds, Docker validation, authenticated real-provider smoke, and manual live canary are all recorded as green in this plan.

This implementation is split into five independently verifiable slices:

1. **Foundation stabilization:** finish the current workspace CRUD, canvas persistence, task records, route shell, and tldraw browser QA.
2. **Provider and storage:** add image provider adapters, object storage, generated asset persistence, and admin runtime config validation.
3. **Task execution and streaming:** add queued worker execution, progress streams, generated image placement, retry/cancel, and safe error surfaces.
4. **Local edits and versions:** add source uploads, mask uploads, image edit tasks, version panel, compare, revert, download, and delete.
5. **Production hardening:** add quotas, cost records, rate limits, admin usage view, deployment service topology, and post-deploy canary checks.

Out of scope for this plan: realtime multi-user canvas collaboration, public galleries, billing, payment, and replacing the existing text chat workspace.

## Current Repository State

This plan is being executed directly on `master`, per the user's preference. The current working tree is intentionally dirty because multiple feature slices are in progress and not yet committed.

Completed foundation and generation slices:

- Backend image workspace Prisma models, migration, parsers, service, controller, and module exist under `packages/backend/src/image-workspaces/`.
- Frontend `/image-workspace` route, API proxy routes, tldraw canvas component, shell, hook, and tests exist under `packages/web-frontend/src/app/image-workspace/` and `packages/web-frontend/src/app/api/image-workspaces/`.
- `tldraw` is already added to `packages/web-frontend/package.json`.
- `packages/web-frontend/src/app/auth/auth-api.ts` includes a browser-side session timeout so the login gate does not hang when the backend is unavailable.
- The tldraw `AtomMap: key [object Object] not found` StrictMode issue has been addressed by delayed `requestAnimationFrame` mount and a stable workspace `persistenceKey`.
- Image provider/storage contracts are implemented with local filesystem storage, database-selected S3-compatible/OSS storage, and OpenAI image provider support.
- OpenAI image provider config is loaded from database-backed runtime secrets through `RuntimeSecretsService.getImageConfig()`; image provider keys must not be read from `.env`.
- Queue, worker, task events, progress stream controller, and frontend stream subscription are implemented for `generate` tasks.
- Generated image task failures are surfaced as user-readable task errors and raw tool/provider payloads are kept out of the visible UI.
- Backend asset endpoints are implemented in `packages/backend/src/image-workspaces/image-assets.controller.ts` and wired through `ImageWorkspacesModule`.
- `ImageWorkerService` now processes `edit` and `variation` tasks by loading owned source/mask versions, calling the image provider, storing a new version, updating `ImageAsset.currentVersionId`, and emitting safe task events.
- Frontend `/api/image-assets/*` proxy routes exist for edit, variation, revert, download, and delete.
- `AssetVersionPanel` and `use-selected-image-asset.ts` are integrated into the image workspace shell.
- `asset-updated` task events trigger workspace reloads on the frontend.
- Backend `ImageAsset` and `CanvasObject` records now hydrate into concrete tldraw image assets/shapes through `hydrateWorkspaceImages(editor, workspace)`.
- Canvas selection and side-panel selection are bridged both ways through `selectedAssetId`, `onSelectAsset`, tldraw shape ids, and `shape.meta.miraAssetId`.
- Canvas deselection now clears the selected Mira asset instead of silently reselecting the first asset. The inspector only shows version/edit controls when there is an actual selected image.
- Task stream connection errors now clear the stale `streamTaskId` after showing the user-readable error, so the workspace does not keep a dead task stream attached.
- Image task streams now include the spec-level `asset-version-created` and `usage` events in addition to the existing compatibility events. Edit-like tasks emit both `asset-version-created` and `asset-updated`; successful provider tasks emit a sanitized `usage` event with provider and optional cost, while the frontend parses those events without exposing raw provider payloads.
- Frontend image previews use the same-origin route `GET /api/image-assets/:assetId/preview` instead of embedding raw storage keys in canvas image sources.
- Frontend token previews use `GET /api/image-assets/preview?token=...` to proxy backend `GET /image-assets/preview?token=...`, so backend signed preview URLs can resolve through the deployed frontend origin.
- The Next preview route forwards the user cookie to backend `GET /image-assets/:assetId/download` and redirects to the signed preview URL returned by the backend.
- Local storage signs short-lived HMAC preview tokens and backend `GET /image-assets/preview?token=...` streams image bytes without requiring a user session.
- Image task creation now records the normalized request IP from `x-forwarded-for`, `request.ip`, or the remote socket and enforces a per-IP daily quota alongside the existing per-user daily quota.
- `ConfiguredImageStorageService` now reads database-backed `IMAGE_STORAGE_*` runtime secrets and delegates image bytes to local storage for development or S3-compatible/OSS storage for production. Signed preview URLs stay behind same-origin HMAC token routes and do not expose raw `storageKey` values.
- Public image workspace and asset serializers no longer expose raw `storageKey` or stored `maskKey` values.
- Backend and frontend now support version-specific signed download/preview routes through `GET /image-assets/:assetId/versions/:versionId/download` and `GET /api/image-assets/:assetId/versions/:versionId/preview`.
- `AssetVersionPanel` uses same-origin version preview URLs for compare thumbnails and version-aware downloads for the selected current version.
- `AssetVersionPanel` now shows same-origin asset preview thumbnails in the asset switcher and marks non-primary preview thumbnails with native lazy loading plus async decoding, reducing unnecessary image fetch/render work in dense workspaces.
- `ImageCanvas` now has a short `setTimeout` fallback in addition to the delayed `requestAnimationFrame` mount, so background/throttled browser contexts do not stay forever on "正在加载图像画布".
- `ImageWorkspaceShell` has been split into focused frontend modules: `WorkspaceRail`, `MobileWorkspaceHeader`, `MobileDrawerOverlay`, `InspectorPanel`, `PromptPanel`, `TaskInspector`, `CanvasToolbar`, and the existing `AssetVersionPanel`.
- `WorkspaceRail` now includes workspace search with filtered counts and an empty state. The search input uses Tailwind focus utilities without outline styling, and the same rail component is reused inside the mobile workspace drawer.
- `ImageWorkspacesService.updateCanvas()` now rejects canvas objects that reference image assets outside the current workspace before replacing canvas objects, preserving the spec invariant that canvas updates cannot attach assets from another workspace.
- Image task cancellation is implemented as Task 9B. Backend queue removal, service/controller route, worker pre-claim skip, post-provider cancellation hardening, frontend proxy/API/hook wiring, and task inspector cancel controls are in the working tree and covered by targeted automated verification. Browser visual QA for this slice now passes against a production Next preview with a mock backend.
- Failed and canceled image task retry is implemented. Backend retry creates a fresh queued task from the original task input instead of mutating the failed/canceled record, re-applies usage policy and queue enqueueing, exposes `POST /image-workspaces/:id/tasks/:taskId/retry`, and the frontend shows a compact retry action only on failed task cards through same-origin proxy routes.
- A local image prompt policy guard now runs before image task quota checks and source/mask lookups. It rejects clearly unsupported image prompts involving child sexual content, explicit sexual content, self-harm, or graphic violence with a safe user-facing message; the prompt panel renders that message below the generation input instead of exposing provider/tool output.
- Browser QA has been re-run after the tldraw hydration, signed preview, and component-split work. Desktop and mobile both render the tldraw canvas and expose the workspace/generation controls.
- Worker task progress copy now matches the task type: generate, edit, variation, upscale, and background removal no longer all reuse the generation-running/failure text.

Current partial slice:

- Real mask drawing/upload is implemented. Backend `POST /image-assets/:assetId/masks` accepts PNG/JPEG/WebP data URLs, stores the uploaded mask through `ImageStorageService`, records the mask as a hidden image asset/version, and returns an internal `maskKey` for edit task creation.
- The temporary raw mask-key input remains removed from the frontend. `AssetVersionPanel` now lets users paint a mask over the selected image, uploads the generated PNG alpha mask first, and passes the returned key only through the internal edit-task API path.
- Hidden mask assets are filtered out of public workspace serialization through `metadata.kind === "mask"` checks, so mask helper records do not appear in the user-facing asset list.
- Mobile inspector drawer overflow has been fixed so prompt, mask, edit, version, and task controls remain reachable on small viewports.
- Production worker topology is now explicit. `docker-compose.yml` and the GitHub Actions deploy template run `backend` for HTTP/migrations and `worker` for `node dist/image-worker-runner.js` using the same backend image. `ImageQueueService` now explicitly injects `RedisService`, so split API and worker processes share the same durable queue instead of falling back to separate in-memory queues. Deploy workflow smoke checks are implemented and test-verified; Docker CLI validation and live deployment smoke still need to run in an environment with Docker available.
- API image task creation no longer double-processes queued tasks in split worker mode. `ImageWorkspacesService` only calls the inline worker fallback when no queue is injected, and `ImageAssetsService` no longer depends on `ImageWorkerService`; edit and variation tasks are persisted and enqueued for the worker process.
- Task 8A provider gating and daily quota guard is implemented. `ImageUsageService` blocks disabled image generation, incomplete provider config, and exhausted daily user quota before task persistence.
- Task 8 backend cost metadata is implemented for generate/edit/variation worker completion. Completed image tasks store provider, model, size, quality, and estimated USD cost metadata when provider metadata supplies it. OpenAI image cost estimates are model-aware for the supported GPT Image models and remain `null` for unrecognized OpenAI-compatible model names.
- Task 8 upload/source guards are implemented at task creation time. Edit-like tasks now pass workspace/request context into `ImageUsageService`, which rejects unsupported source MIME types and oversized source or mask images before persisting a queued task.
- Task 8 admin usage reporting has a backend endpoint at `GET /admin/image-usage`. It requires an admin session and returns a 30-day image task summary with status counts, active users, provider/type breakdowns, and estimated cost totals.
- Task 8B frontend admin usage UI is implemented. The admin console now has a same-origin `/api/admin/image-usage` proxy route, typed API loader, `图像用量` navigation item, overview shortcut, and compact usage/cost reporting panel.
- Admin image provider testing is implemented. Backend `POST /admin/image-provider/test` requires an admin session, checks database-backed image provider settings, and when configured performs a cheap OpenAI model validation request before returning only safe provider/model/missing-key status. Frontend `/api/admin/image-provider/test` proxies the call through the same origin, and `AdminSecretsPanel` now has a compact `测试图像 Provider` action with pass/fail feedback that does not expose secret values.
- `ImageAgentService` now exists as a thin backend image-agent boundary. It prepares durable task input from typed image requests and reconstructs retry requests from failed/canceled task input without introducing generic chat tool events or raw provider payloads. Prompt expansion or multi-step GPT planning remains a future extension behind this boundary.
- Selected image actions now include upscale and background removal. Backend `POST /image-assets/:assetId/upscale` and `POST /image-assets/:assetId/remove-background` create queued versioned transform tasks; `ImageWorkerService` processes both through the existing safe edit pipeline, creating new versions instead of mutating originals. Frontend same-origin proxy routes, API helpers, hook actions, and `AssetVersionPanel` icon controls are wired through the shell.
- Safe image task cancellation is implemented. Queued/running tasks can be canceled from the inspector, queued items are removed from the shared queue, canceled tasks emit a safe `task-progress` event, active task streams are cleared on `canceled`, and workers re-check task status after provider calls before writing assets or marking tasks complete.
- Local source image uploads are implemented end to end. Backend `POST /image-workspaces/:id/assets` validates PNG/JPEG/WebP data URLs, stores uploaded bytes through the configured image storage service, creates visible source assets plus canvas objects, and returns only safe serialized workspace data. The frontend exposes `上传源图到画布` in desktop and mobile generation panels, reads the selected file through `FileReader.readAsDataURL`, and refreshes the active workspace from the same-origin proxy response.
- `ImageCanvas.hydrateWorkspaceImages()` now also removes stale Mira image shapes when backend asset deletion detaches or deletes the corresponding canvas objects, so deleted assets do not linger on the tldraw canvas after workspace hydration.

Last green broader automated verification before this frontend continuation:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types image-assets.controller image-assets.service
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
```

Additional green verification from this continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
pnpm --filter @rednote/backend test -- image-worker
pnpm build:backend
pnpm --filter @rednote/backend test -- image-usage
pnpm --filter @rednote/backend test -- image-usage image-workspaces.service
pnpm --filter @rednote/backend test -- image-worker image-workspaces.service image-usage
pnpm --filter @rednote/backend test -- openai-image-provider image-worker image-worker-edit image-usage image-workspaces.service
pnpm --filter @rednote/backend test -- image-usage image-workspaces.service
pnpm --filter @rednote/backend test -- admin.controller openai-image-provider image-worker image-worker-edit image-usage image-workspaces.service
```

Latest green verification from the mask upload and mobile drawer continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:frontend
```

Latest green verification from the source upload and stale canvas-shape cleanup continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller image-workspaces.service image-usage
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
```

Additional focused verification after the stale-shape cleanup:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
```

Red result before implementation: the new frontend source test failed because `ImageCanvas` did not remove stale Mira image shapes after a backend asset deletion changed the hydrated workspace payload.

Green result after implementation: frontend image workspace tests passed 107/107 and the frontend production build completed successfully.

Latest green verification from the production worker topology continuation:

```bash
pnpm --filter @rednote/backend test -- deployment-topology
pnpm --filter @rednote/backend test -- deployment-topology image-worker image-queue
pnpm --filter @rednote/backend test -- image-queue
pnpm build:backend
ruby -e 'require "yaml"; YAML.load_file("docker-compose.yml"); puts "compose yaml ok"'
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "workflow yaml ok"'
```

Latest green verification from the deployment smoke-check continuation:

```bash
pnpm --filter @rednote/backend test -- deployment-topology
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "workflow yaml ok"'
```

Latest green verification from the signed-preview and storage-facade continuation:

```bash
pnpm --filter @mira/web-frontend test -- proxy.test
pnpm --filter @rednote/backend test -- image-storage
pnpm --filter @rednote/backend test -- image-storage image-assets openai-image-provider
pnpm build:backend
pnpm build:frontend
```

Latest green verification from the duplicate task execution fix:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service image-assets
pnpm --filter @rednote/backend test -- image-workspaces.service image-assets image-worker image-queue
pnpm build:backend
```

Latest green verification from the frontend interaction continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
```

Latest green verification from the selected asset action continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets image-worker-edit
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm --filter @rednote/backend test -- image-assets image-worker image-worker-edit image-workspaces.service image-usage
pnpm build:backend
pnpm build:frontend
```

Latest green verification from the admin image provider test action continuation:

```bash
pnpm --filter @rednote/backend test -- admin.controller
pnpm --filter @mira/web-frontend test -- admin-copy proxy.test
pnpm --filter @rednote/backend test -- admin.controller runtime-secrets openai-image-provider
pnpm build:backend
pnpm build:frontend
```

Latest red/green verification from the provider validation request hardening:

```bash
pnpm --filter @rednote/backend test -- admin.controller
pnpm --filter @rednote/backend test -- admin.controller runtime-secrets openai-image-provider
pnpm --filter @mira/web-frontend test -- admin-copy proxy.test
pnpm build:backend
```

Red result before implementation: `admin.controller` failed because `POST /admin/image-provider/test` returned configured status without calling the provider validation request.

Green result after implementation: admin controller tests passed 18/18, the related backend suites passed 26/26, frontend admin/proxy tests passed 111/111, and backend production build completed successfully. The admin provider test now calls `GET https://api.openai.com/v1/models/:model` with the configured image API key when configuration is complete, and still returns only safe status/copy without exposing the key or raw provider error.

Latest green verification from the canvas asset ownership continuation:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-assets
pnpm build:backend
git diff --check
```

Latest green verification from the per-IP image task quota continuation:

```bash
pnpm --filter @rednote/backend test -- image-usage image-workspaces.service image-workspaces.controller
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm build:backend
git diff --check
```

Latest green verification from the safe task cancellation continuation:

```bash
pnpm --filter @rednote/backend test -- image-worker
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-queue image-workspaces.service image-workspaces.controller image-worker
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm build:backend
pnpm build:frontend
git diff --check
```

Latest green verification from the post-storage cancellation cleanup continuation:

```bash
pnpm --filter @rednote/backend test -- image-worker.service image-worker-edit
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm build:backend
git diff --check
```

Red result before implementation: new generate/edit worker tests failed because a task canceled after `storage.putImage()` could leave an orphan stored image and still proceed toward durable asset/version persistence.

Green result after implementation: worker tests passed 11/11, broader backend image-workspace suites passed 76/76, backend TypeScript build completed successfully, and `git diff --check` produced no output. `ImageWorkerService` now re-checks task cancellation immediately after storage writes, best-effort deletes the just-stored image, and returns before creating generated assets or edited versions.

Latest green verification from the thin image-agent boundary continuation:

```bash
pnpm --filter @rednote/backend test -- image-agent
pnpm --filter @rednote/backend test -- image-agent image-workspaces.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm build:backend
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: `image-agent.service.spec.ts` failed because `packages/backend/src/image-workspaces/image-agent.service.ts` did not exist.

Green result after implementation: the focused image-agent/workspace service tests passed 18/18, broader backend image-workspace suites passed 79/79, frontend image workspace/proxy suites passed 107/107, backend and frontend production builds completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches.

Latest red/green verification from the image task event protocol continuation:

```bash
pnpm --filter @rednote/backend test -- image-worker.service image-worker-edit
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: backend worker tests failed because successful generate/edit tasks did not emit `usage` or `asset-version-created` events, and frontend image-workspace tests failed because the task stream hook did not parse `asset-version-created` or `usage`.

Green result after implementation: backend worker tests passed 11/11, broader backend image-workspace suites passed 80/80, frontend image workspace/proxy suites passed 108/108, backend and frontend production builds completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches.

Current in-progress event protocol completion:

- The spec-level event union includes `task-created`, `task-progress`, `asset-placeholder`, `asset-created`, `asset-version-created`, `canvas-updated`, `usage`, and `error`.
- `asset-version-created` and `usage` are implemented and verified as described above.
- `task-created` is now represented in backend/frontend event types, emitted after queued task persistence, parsed by `use-image-task-stream.ts`, and intentionally ignored by `use-image-workspace.ts` because it is informational for the active task stream.
- `asset-placeholder` is now represented in backend/frontend event types, emitted by generate workers using the requested target position, parsed by `use-image-task-stream.ts`, and intentionally ignored by `use-image-workspace.ts` until the UI chooses to render optimistic placeholder shapes.
- `canvas-updated` is now represented in backend/frontend event types for task-owned canvas mutations. Generate workers emit it after creating the durable canvas object, the frontend task stream parser accepts it, and `use-image-workspace.ts` refreshes the affected workspace by `workspaceId`. User-driven canvas persistence such as dragging/resizing still uses the existing save response path rather than a workspace-level realtime event stream.

Latest green verification from the `task-created` and `asset-placeholder` continuation:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service image-worker.service
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: backend `image-workspaces.service` failed because one queue mock still omitted the now-required `emitEvent` method, and frontend `image-workspace` failed because the test expected raw `taskType: value.taskType` even though stream parsing deliberately normalizes external task types.

Green result after implementation: focused backend image workspace/worker tests passed 20/20, frontend image workspace tests passed 109/109, broader backend image workspace suites passed 80/80, frontend image workspace/proxy suites passed 109/109, backend and frontend production builds completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches.

Latest green verification from the `canvas-updated` task event continuation:

```bash
pnpm --filter @rednote/backend test -- image-worker.service
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: backend `image-worker.service` failed because successful generate tasks did not emit `canvas-updated`, and frontend `image-workspace` failed because the event type, stream parser, and workspace refresh branch did not exist.

Green result after implementation: backend worker tests passed 5/5, frontend image workspace tests passed 110/110, broader backend image workspace suites passed 80/80, frontend image workspace/proxy suites passed 110/110, backend and frontend production builds completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches.

Latest green verification from the image task stream ownership continuation:

```bash
pnpm --filter @rednote/backend test -- image-task-stream image-workspaces.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: backend task stream tests failed because `ImageTaskStreamController` only verified the workspace owner before subscribing to a task event key, and `ImageWorkspacesService.assertTaskBelongsToWorkspace()` did not exist.

Green result after implementation: task stream/workspace service tests passed 17/17, broader backend image workspace suites passed 81/81, backend production build completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Task streams now require the `taskId`, `workspaceId`, and `userId` to match before existing events or future pub/sub events are written to the response.

Latest green verification from the soft-deleted workspace asset guard continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: `image-assets.service` allowed `download()` for an asset whose workspace had been soft deleted because `findOwnedAsset()` only matched `asset.id` and `asset.userId`.

Green result after implementation: focused image asset service tests passed 18/18, broader backend image workspace suites passed 82/82, backend production build completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Asset operations now require the owning workspace relation to have `deletedAt: null`, so edit, download, revert, transform, upload mask, and delete paths cannot act on assets from a soft-deleted workspace.

Latest green verification from the asset task usage-guard continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: `image-assets.service` created edit, variation, upscale, and background-removal tasks without calling `ImageUsageService.assertCanCreateTask()`, so those paths bypassed the provider kill switch, quota checks, prompt policy, and source/mask input size checks that already protected text-to-image generation.

Green result after implementation: focused image asset service tests passed 18/18, broader backend image workspace suites passed 82/82, backend production build completed successfully, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Asset task creation now passes full typed request context, including `assetId`, `versionId`, optional `maskKey`, and transform `size`, into `ImageUsageService` before persisting a queued task.

Latest red/green verification from the opaque mask upload continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.service
pnpm --filter @rednote/backend test -- image-assets.service image-assets.controller image-workspaces.types image-agent image-worker-edit
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
node --test scripts/image-workspace-smoke.test.mjs
git diff --check
```

Red result before implementation: `image-assets.service` returned `maskKey: "local/..."` from `uploadMask()`, and the smoke/edit path sent that raw storage key back through the public frontend/API layer.

Green result after implementation: focused asset service tests passed 21/21, related backend image suites passed 48/48, frontend image workspace/proxy tests passed 111/111, full backend tests passed 37/37 suites and 220/220 tests, full frontend tests passed 111/111, backend and frontend production builds completed successfully, smoke script structure tests passed 4/4, and `git diff --check` produced no output. Public mask upload now returns an opaque `maskId`, the frontend and smoke script send `maskId` for edits, and the backend resolves that id to the internal `maskKey` only inside `ImageAssetsService` before persisting the worker task input.

Latest red/green verification from the public edit mask-key hardening:

```bash
pnpm --filter @rednote/backend test -- image-assets.service image-assets.controller
pnpm --filter @rednote/backend test -- image-assets.service image-assets.controller image-workspaces.types image-agent image-worker-edit
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
node --test scripts/image-workspace-smoke.test.mjs
```

Red result before implementation: the public edit service still parsed a raw `maskKey` from the request body and rejected cross-workspace values, proving the public edit API path still understood storage keys.

Green result after implementation: public edit requests now ignore raw `maskKey` and only accept the opaque `maskId` returned by mask upload. The browser-side image workspace code and real smoke script no longer define or send `maskKey`; worker task input still uses internal `maskKey` after the backend resolves `maskId`. Related backend suites passed 48/48, full backend tests passed 37/37 suites and 220/220 tests, frontend tests passed 111/111, backend and frontend production builds completed, and smoke script structure tests passed 4/4.

Latest green verification from the auth-session watchdog continuation:

```bash
pnpm --filter @mira/web-frontend test -- email-login-panel
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:frontend
```

This continuation also added `AUTH_SESSION_WATCHDOG_MS = 6500` in `packages/web-frontend/src/app/auth/use-auth-session.ts`. The hook now falls back to `guest` when a browser-side session check never resolves, so the image workspace route should not stay indefinitely on `正在验证 Mira 会话` if the auth request is blocked, throttled, or left pending by the browser context.

Latest green verification from the auth-gate dynamic-shell continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
```

This continuation also changed `packages/web-frontend/src/app/image-workspace/page.tsx` to load `ImageWorkspaceShell` through `next/dynamic` with `ssr: false`. The auth gate no longer statically imports the heavy tldraw workspace shell, so the login/session screen can hydrate and resolve before the canvas bundle is loaded.

Latest green verification from the mobile generation drawer QA continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:frontend
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm build:backend
git diff --check
```

Docker CLI check from this continuation:

```bash
docker --version
docker compose version
```

Result: both commands returned `command not found` in the current local environment, so Docker compose validation still needs to run on a machine with Docker available.

`docker compose config --quiet` was attempted with placeholder deployment variables, but the current local environment does not have the Docker CLI installed.

Latest browser QA after the mask upload and mobile drawer continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a mock backend at http://127.0.0.1:3012
Desktop 1280x720: workspace rail, tldraw canvas, generation panel, image version panel, and task list render. Mask drawing controls and edit prompt are visible in the inspector.
Interaction: drawing a mask enables the clear control; submitting an edit uploads the mask first, creates an edit task, clears the local mask state, and keeps raw `maskKey`/tool/provider payloads out of visible UI. The temporary mock task stayed queued instead of completing its stream, so a real provider or improved mock stream should still be used for final end-to-end completion verification.
Mobile 390x844: header drawer buttons render; generation drawer exposes prompt, versions, mask controls, edit form, and tasks. The inspector body now scrolls, and the edit textarea/button can be brought into view without horizontal overflow.
Console: only known tldraw zh-cn missing message warnings were observed.
```

Latest image workspace browser QA after the auth-gate dynamic-shell continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Session check: http://127.0.0.1:3011/api/auth/session returned the mock QA user.
Desktop 1280x720: the route leaves 正在验证 Mira 会话, renders the workspace rail, tldraw canvas, right prompt panel, and queued task inspector.
Cancellation interaction: canceling the queued mock task changed task-qa from queued to canceled, removed the cancel button, and kept raw provider/tool/storage payloads out of the visible UI.
Mobile 390x844: the header, 打开工作区 control, Mira 视觉草稿 title, 打开生成面板 control, return link, and tldraw canvas render without horizontal overflow.
Known caveat: the long-running Next dev server at http://127.0.0.1:3000 still appeared stale and stayed on 正在验证 Mira 会话. Use a clean dev-server restart or the production preview target for future browser QA.
```

Latest mobile generation drawer browser QA:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Mock data: one workspace, one queued task, one selected image asset, two image versions, and same-origin preview/download token routes.
Mobile 390x844: 打开生成面板 opens the inspector drawer. After selecting 柔光产品图, prompt input, generation task button, current/previous version stats, mask canvas, compare, variation, upscale, background removal, revert, download, delete, edit prompt, edit task button, and cancel task controls are all reachable.
Layout check: document width and body width were both 390px, so no horizontal overflow was present.
Console check: no browser error or warning logs were observed during the mobile drawer QA run.
```

Latest red/green verification from the canvas persistence continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:frontend
git diff --check
```

Red result before implementation: `image canvas persists tldraw geometry and viewport through backend snapshots` failed because `use-canvas-persistence.ts should exist`.

Green result after implementation: targeted frontend tests passed 100/100, `pnpm build:frontend` completed successfully, and `git diff --check` produced no output. `ImageCanvas` now passes tldraw image geometry and camera snapshots to `workspace.persistCanvas`, and applies saved workspace viewport back to the tldraw camera.

Latest browser QA from the canvas persistence continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: the authenticated image workspace loaded, tldraw reported Image. 1 of 1, and the version panel showed 柔光产品图.
Interaction: dragging the selected image emitted PATCH /image-workspaces/workspace-qa/canvas with object-qa moved from 160,140 to 265,205 and no non-Mira shapes in the payload.
Viewport: scrolling the tldraw canvas emitted another PATCH with viewport { x: 0, y: 650, zoom: 1 }.
Reload: after refresh, the workspace title, tldraw Image. 1 of 1 status, and version panel all returned from the mock backend snapshot.
Console: no browser error or warning logs were observed during this QA run.
```

Latest red/green verification from the focused canvas toolbar continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:frontend
git diff --check
```

Red result before implementation: `image canvas exposes a focused Mira toolbar for common canvas actions` failed because `components/canvas-toolbar.tsx should exist`.

Green result after implementation: targeted frontend tests passed 101/101, `pnpm build:frontend` completed successfully, and `git diff --check` produced no output. `CanvasToolbar` is now a focused component with icon buttons for select, pan, frame, undo, redo, zoom in, zoom out, and fit view.

Latest browser QA from the focused canvas toolbar continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: the authenticated image workspace loaded, the floating toolbar exposed 选择, 平移, 画框, and 适配视图 controls, and tldraw reported Image. 1 of 1.
Interaction: clicking 平移 and 适配视图 resolved to exactly one button each and produced no browser error or warning logs.
Mobile 390x844: the toolbar remained visible, body/document width stayed at 390px, and there was no horizontal overflow.
```

Latest red/green verification from the workspace rail search continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:frontend
git diff --check
```

Red result before implementation: `image workspace rail includes workspace search` failed because the workspace rail did not expose the search control.

Green result after implementation: targeted frontend tests passed 102/102, `pnpm build:frontend` completed successfully, and `git diff --check` produced no output. `WorkspaceRail` now filters workspaces by title, updates the filtered/total count, and shows `没有匹配的图像画布` when no workspace matches.

Latest browser QA from the workspace rail search continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: the authenticated image workspace loaded with two mock workspaces. Searching `产品` filtered the rail to `1 / 2 个图像画布` and only showed 产品概念草图. Searching `不存在` showed `0 / 2 个图像画布` and the empty state 没有匹配的图像画布.
Mobile 390x844: 打开工作区 opened the workspace drawer, the same search input filtered `品牌` to only 品牌海报画布, and document width stayed at 390px with no horizontal overflow.
Console: no browser error or warning logs were observed during this QA run.
```

Latest red/green verification from the asset thumbnail lazy-loading continuation:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
git diff --check
```

Red result before implementation: `asset version panel lazy-loads same-origin asset thumbnails` failed because the asset switcher did not use `createImageAssetPreviewUrl` and did not expose lazy-loaded thumbnails.

Green result after implementation: targeted frontend tests passed 103/103, `pnpm build:frontend` completed successfully, and `git diff --check` produced no output. Asset switcher thumbnails now use `/api/image-assets/:assetId/preview` and include `loading="lazy"` plus `decoding="async"` without exposing raw storage keys.

Latest browser QA from the asset thumbnail lazy-loading continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: the selected asset panel rendered two 32px asset thumbnails sourced from same-origin `/api/image-assets/.../preview` URLs; both switcher thumbnails had `loading=lazy` and `decoding=async`, and document width stayed at 1280px with no horizontal overflow.
Mobile 390x844: 打开生成面板 exposed the same two asset thumbnails inside the inspector drawer; both retained lazy loading and async decoding, and document width stayed at 390px with no horizontal overflow.
Console: no browser error or warning logs were observed during this QA run.
```

Latest red/green verification from the image task retry continuation:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service image-workspaces.controller
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-workspaces.service image-workspaces.controller image-worker image-queue
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
```

Red result before implementation: backend tests failed because `ImageWorkspacesService.retryTask` and `ImageWorkspacesController.retryTask` did not exist; frontend tests failed because `retryImageTask`, the `/retry` proxy route, and task retry controls did not exist.

Green result after implementation: backend retry-related suites passed 31/31, frontend image workspace/proxy tests passed 104/104, both backend and frontend builds completed successfully, and `git diff --check` produced no output. Next build lists `/api/image-workspaces/[id]/tasks/[taskId]/retry`.

Latest browser QA from the image task retry continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: the authenticated image workspace loaded with one failed task. Clicking 重试任务 created a fresh second task from the same prompt, the new task progressed to complete through the mock stream, the original failed task remained visible, no raw storage/provider/tool payloads appeared, and document width stayed at 1280px.
Mobile 390x844: 打开生成面板 exposed the failed task retry action in the inspector drawer, with no horizontal overflow and no raw storage/provider/tool payloads visible.
Console: no browser error or warning logs were observed during this QA run.
```

Latest red/green verification from the local image prompt policy continuation:

```bash
pnpm --filter @rednote/backend test -- image-usage
pnpm --filter @rednote/backend test -- image-usage image-workspaces.service image-assets
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:backend
pnpm build:frontend
git diff --check
```

Red result before implementation: `blocks unsafe image generation prompts before quota writes` and `blocks unsafe image edit prompts before source lookup` failed because `ImageUsageService.assertCanCreateTask()` allowed unsupported prompts through to quota/source validation.

Green result after implementation: backend image usage/service/asset suites passed 47/47, frontend image workspace tests passed 105/105, both backend and frontend builds completed successfully, and `git diff --check` produced no output. Unsafe prompt checks now run before task quota counting and source/mask version lookup.

Latest browser QA from the local image prompt policy continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: submitting an unsupported image prompt returned `图像提示词包含不支持的内容，请调整后重试`, rendered in the prompt panel danger style, did not create a task, kept the visible task count at zero, and did not expose raw storage/provider/tool payloads.
Mobile 390x844: 打开生成面板 exposed the same prompt error below the mobile drawer input, with no horizontal overflow and no raw storage/provider/tool payloads visible.
Console: no browser error or warning logs were observed during this QA run.
```

Latest green verification from the asset task request-IP continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.controller image-assets.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: asset controller/service tests failed because asset task creation did not pass normalized request IP into `ImageAssetsService`, and asset service usage guard contexts omitted `requestIp`.

Green result after implementation: focused asset controller/service tests passed 26/26, broader backend image workspace suites passed 82/82, backend production build completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Edit, variation, upscale, and background-removal task creation now enforce per-IP quota consistently with text-to-image generation tasks.

Latest deployment validation attempt:

```bash
docker --version
docker compose version
ruby -e 'require "yaml"; YAML.load_file("docker-compose.yml"); puts "compose yaml ok"'
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "workflow yaml ok"'
```

Result: `docker --version` and `docker compose version` returned `command not found` in the current local environment, so Docker CLI/compose validation remains open. Static YAML parsing passed for `docker-compose.yml` and `.github/workflows/deploy.yml`.

Latest green verification from the image generation settings continuation:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types image-agent
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: backend parser/agent tests failed because `size`, `quality`, and `background` were dropped from image task requests and retry input; frontend image workspace tests failed because the prompt panel had no compact generation settings and `createImageTask()` only accepted prompt/target/asset fields.

Green result after implementation: backend image workspace parser/agent tests passed 12/12, broader backend image workspace suites passed 84/84, frontend image workspace/proxy suites passed 111/111, backend and frontend production builds completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. The generation panel now exposes compact画幅/质量/背景 controls, frontend task creation forwards those settings, backend parsing validates them, retry preserves them, and worker/provider input can now use the existing image provider size/quality/background support.

Browser QA from the image generation settings continuation:

```text
Target: http://127.0.0.1:3011/image-workspace with a production Next preview and a mock backend at http://127.0.0.1:3001
Desktop 1280x720: the authenticated image workspace rendered workspace rail, tldraw canvas, prompt panel, and compact generation settings for 画幅, 质量, and 背景. Document width and scroll width were both 1280px, and no raw storage/tool/provider payloads appeared in visible text.
Console: no browser error or warning logs were observed during the desktop settings visibility check.
Mobile 390x844: the page width and scroll width were both 390px, and the icon-only 打开生成面板 control was present by aria-label. The in-app browser evaluate/click sandbox did not reliably dispatch the React click handler for the drawer in this run, so mobile drawer expansion for the new settings remains covered by source tests and should be re-checked in a normal browser or a more stable browser-control session before production landing.
Cleanup: temporary mock backend on 3001 and Next preview on 3011 were stopped after QA.
```

Latest green verification from the mask upload size-limit continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: `image-assets.service` accepted oversized PNG mask data URLs and wrote them to image storage, even though the spec requires upload MIME and size validation.

Green result after implementation: focused asset service tests passed 19/19, broader backend image workspace suites passed 85/85, backend production build completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Mask uploads now reject payloads larger than the existing 20 MB image upload limit before calling `storage.putImage()`.

Latest green verification from the asset delete storage cleanup continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: deleting an image asset detached canvas objects and deleted metadata, but left every image version binary in object storage.

Green result after implementation: focused asset service tests passed 20/20, broader backend image workspace suites passed 86/86, backend production build completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Asset deletion now best-effort deletes every stored version file after durable metadata deletion.

Latest green verification from the public image payload sanitization continuation:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types
pnpm --filter @rednote/backend test -- image-assets.service
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: public workspace serialization still exposed `providerJob` on image versions, public task input returned internal `maskKey`, `storageKey`, and `providerJob` fields, public task output could include raw storage/provider fields, asset action responses still included version `providerJob`, and the frontend `ImageVersion` type still expected `providerJob`.

Green result after implementation: focused backend serializer tests passed 9/9, focused asset service tests passed 20/20, frontend image workspace tests passed 111/111, broader backend image workspace suites passed 87/87, frontend image workspace/proxy suites passed 111/111, backend and frontend production builds completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Public image workspace and asset payloads now keep only UI-safe task/version fields while preserving internal database/provider fields for worker execution.

Latest green verification from the split worker progress pub/sub continuation:

```bash
pnpm --filter @rednote/backend test -- image-queue
pnpm --filter @rednote/backend test -- redis.service
pnpm --filter @rednote/backend test -- image-task-stream
pnpm --filter @rednote/backend test -- redis.service image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: two `ImageQueueService` instances backed by the same Redis mock did not deliver a task event across process boundaries. `emitEvent()` persisted the event list, but `subscribe()` only notified in-memory listeners in the same Node process, so the deployed split API/worker topology could leave an open HTTP progress stream unaware of worker-emitted progress until reconnect.

Green result after implementation: focused queue tests passed 5/5, Redis service tests passed 4/4, task stream tests passed 1/1, broader backend image workspace/Redis suites passed 92/92, backend production build completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. `RedisService` now exposes publish/subscribe with a dedicated subscriber client, and `ImageQueueService` publishes task events through Redis pub/sub while retaining in-memory fallback behavior for local no-Redis development.

Latest green verification from the atomic Redis queue claim continuation:

```bash
pnpm --filter @rednote/backend test -- image-queue
pnpm --filter @rednote/backend test -- redis.service
pnpm --filter @rednote/backend test -- image-queue image-task-stream
pnpm --filter @rednote/backend test -- redis.service image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: when two `ImageQueueService` instances shared the same Redis-backed JSON queue and raced on `claimNext()`, both could read the same queue snapshot and claim the same `task-race` payload. That made duplicate image generation possible in the production split-worker topology.

Green result after implementation: focused queue tests passed 6/6, Redis service tests passed 5/5, queue/task-stream tests passed 7/7, broader backend image workspace/Redis suites passed 94/94, backend production build completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Redis-backed task enqueue/claim/remove now use list operations (`LPUSH`, `RPOP`, `LREM`) for atomic multi-worker claiming while preserving the JSON snapshot/in-memory fallback path for compatibility and local development.

Latest green verification from the canceled Redis queue removal continuation:

```bash
pnpm --filter @rednote/backend test -- image-queue
pnpm --filter @rednote/backend test -- redis.service
pnpm --filter @rednote/backend test -- image-queue image-task-stream
pnpm --filter @rednote/backend test -- redis.service image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: canceling a task with only a Redis list entry and no JSON queue snapshot left the pending Redis list item claimable by workers.

Green result after implementation: queue tests passed 7/7, Redis service tests passed 6/6, queue/task-stream tests passed 8/8, broader backend image workspace/Redis suites passed 96/96, backend production build completed, `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. Redis-backed queue removal now deletes pending list items by `taskId` directly, the JSON compatibility snapshot remains filtered, and split API/worker cancellation no longer depends on reconstructing the full queue payload before `LREM`.

Latest deployment configuration preflight:

```bash
docker --version
docker compose version
pnpm --filter @rednote/backend test -- deployment-topology
ruby -e 'require "yaml"; YAML.load_file("docker-compose.yml"); puts "compose yaml ok"'
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "workflow yaml ok"'
```

Result: Docker CLI validation is not complete on this machine because both `docker --version` and `docker compose version` return `zsh:1: command not found: docker`. The repository-level deployment topology test passed 4/4, `docker-compose.yml` parsed successfully, and `.github/workflows/deploy.yml` parsed successfully. `docker compose config --quiet` still needs to run in an environment with Docker available before this gate can be considered complete.

Latest server-side Docker and live smoke preflight:

```bash
ssh root@47.115.149.71 'cd /home/mira && docker compose config --quiet && docker compose ps'
ssh root@47.115.149.71 'cd /home/mira && docker compose exec -T backend node -e "require(\"http\").get(\"http://localhost:3000/health\", r => { console.log(r.statusCode); process.exit(r.statusCode === 200 ? 0 : 1); })"'
curl --silent --show-error --location --max-time 20 -o /tmp/mira-admin-http.body -w '%{http_code} %{url_effective}\n' http://47.115.149.71/admin
curl --silent --show-error --location --max-time 20 -o /tmp/mira-image-http.body -w '%{http_code} %{url_effective}\n' http://47.115.149.71/image-workspace
curl --silent --show-error --location --max-time 20 -o /tmp/mira-admin-https-ip.body -w '%{http_code} %{url_effective}\n' https://47.115.149.71/admin
curl --silent --show-error --location --max-time 20 -o /tmp/mira-image-https-ip.body -w '%{http_code} %{url_effective}\n' https://47.115.149.71/image-workspace
ssh root@47.115.149.71 'cd /home/mira && docker compose exec -T frontend sh -lc "pwd; find . -path \"*image-workspace*\" -o -path \"*.next/server/app*image*\" | head -50"'
```

Result: server-side `docker compose config --quiet` passed. `docker compose ps` showed backend, frontend, postgres, and redis healthy; caddy was up with ports 80 and 443 exposed. Backend in-container health returned `200`. Live smoke partially passed: `/admin` returned HTTP 200 over both `http://47.115.149.71/admin` and `https://47.115.149.71/admin`. Live smoke for the new image workspace failed: `/image-workspace` returned HTTP 404 over both HTTP and HTTPS-IP. Inspecting the frontend container showed `/app` but no `image-workspace` build artifacts, so the current live image does not include this uncommitted/unpushed workspace route yet. Full live canary remains incomplete until the current worktree is built, pushed, deployed, and `/image-workspace` returns the production page.

Latest local frontend route build verification:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:frontend
find packages/web-frontend/.next/server/app -maxdepth 3 -path '*image-workspace*' -print | sort | sed -n '1,80p'
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Result: frontend image workspace/proxy tests passed 111/111, the production frontend build completed successfully, and Next's route summary included `○ /image-workspace` plus all `/api/image-workspaces/*` routes. The local build produced `packages/web-frontend/.next/server/app/image-workspace/page.js` and related `image-workspace` server artifacts. `git diff --check` produced no output, and the untracked-file conflict/trailing-whitespace scan produced no matches. This confirms the source worktree can build the image workspace route; the live 404 is because the currently deployed frontend image is older than this worktree.

Latest full local verification before deployment:

```bash
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
find packages/web-frontend/.next/server/app -maxdepth 3 -path '*image-workspace*' -print | sort | sed -n '1,40p'
```

Result: backend tests passed 37/37 suites and 219/219 tests. Frontend tests passed 111/111 tests. Backend production build completed successfully after Prisma Client generation. Frontend production build completed successfully and Next's route summary included `○ /image-workspace` plus all `/api/image-workspaces/*` routes. `git diff --check` produced no output, the untracked-file conflict/trailing-whitespace scan produced no matches, and the local `.next/server/app` tree contains `image-workspace/page.js`. One backend test intentionally logs `database unavailable` while asserting error behavior; the overall Jest exit code was 0.

Latest local verification from the smoke-runbook continuation:

```bash
node --test scripts/image-workspace-smoke.test.mjs
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
ruby -e 'require "yaml"; YAML.load_file("docker-compose.yml"); puts "compose yaml ok"'
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "workflow yaml ok"'
pnpm test:backend
pnpm test:frontend
pnpm build:backend
pnpm build:frontend
pnpm --filter @rednote/backend test -- deployment-topology
find packages/web-frontend/.next/server/app -maxdepth 3 -path '*image-workspace*' -print | sort | sed -n '1,80p'
docker --version
docker compose version
```

Result: smoke script structure tests passed 3/3. `git diff --check` produced no output. The untracked-file conflict/trailing-whitespace scan produced no matches; `rg` returned exit code 1 only because it found no matches. `docker-compose.yml` and `.github/workflows/deploy.yml` parsed successfully. Backend tests passed 37/37 suites and 219/219 tests; the expected `database unavailable` log came from an error-handling test and the Jest exit code was 0. Frontend tests passed 111/111. Backend and frontend production builds completed successfully, and the frontend route summary included `○ /image-workspace` plus all image workspace and image asset proxy routes. Deployment topology tests passed 4/4. The local build artifact tree includes `packages/web-frontend/.next/server/app/image-workspace/page.js` and related route artifacts. Docker CLI validation remains unavailable on this local machine because both `docker --version` and `docker compose version` returned `zsh:1: command not found: docker`.

Latest local browser QA before deployment:

```bash
node mock backend on 127.0.0.1:4011
BACKEND_AGENT_BASE_URL=http://127.0.0.1:4011 pnpm --filter @mira/web-frontend exec next start -p 4010
Browser: http://127.0.0.1:4010/image-workspace
```

Result: the local production frontend served `/image-workspace` through the same-origin backend proxies pointed at a mock backend. Desktop viewport loaded the authenticated image workspace after session hydration, rendered the workspace rail, tldraw canvas/container, prompt panel, provider settings, version panel, and task panel, with no browser console errors. The visible page contained no raw `tool_call`, `tool_result`, `storageKey`, `maskKey`, `providerJob`, or `b64_json` text. Mobile viewport at 390x844 rendered the canvas and exposed both `打开工作区` and `打开生成面板` controls with no browser console errors and no raw tool/storage/provider field leakage. A direct browser `fill()` interaction against the prompt textarea could not be completed in this runtime because Browser Use reported its virtual clipboard was not installed; the prompt/generate interaction path remains covered by automated frontend tests and still needs post-deploy/manual browser confirmation after the current worktree is deployed.

Latest requirement-by-requirement audit:

Source of truth: `docs/superpowers/specs/2026-06-23-mira-image-agent-canvas-design.md`.

Status by requirement group:

- **Separate Mira Image Workspace:** Achieved in source and local build. Evidence: `packages/web-frontend/src/app/image-workspace/page.tsx`, split components under `packages/web-frontend/src/app/image-workspace/components/`, same-origin proxy routes under `packages/web-frontend/src/app/api/image-workspaces/`, full local frontend build route summary includes `○ /image-workspace`, local browser QA renders the route. Live deployment evidence is missing because current server frontend image returns 404 for `/image-workspace`.
- **tldraw infinite canvas and layout:** Achieved in source and local browser QA. Evidence: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx` imports `Tldraw`, hydrates backend image objects, persists viewport/geometry, and removes stale shapes; local browser QA confirms tldraw container/canvas on desktop and mobile. Prompt/generate direct fill interaction still needs post-deploy/manual browser confirmation because the current Browser runtime could not fill the textarea.
- **Backend module and public-user auth:** Achieved in source and tests. Evidence: `packages/backend/src/image-workspaces/image-workspaces.module.ts`, `image-workspaces.controller.ts`, `image-assets.controller.ts`, `image-task-stream.controller.ts`; controllers use `UserSessionService.requireUser()` with public user session cookies. Tests cover ownership/session behavior in `image-workspaces.service.spec.ts`, `image-workspaces.controller.spec.ts`, `image-assets.service.spec.ts`, and `image-assets.controller.spec.ts`.
- **Image-specific Prisma data model:** Achieved in source. Evidence: `packages/backend/prisma/schema.prisma` defines `ImageWorkspaceStatus`, `ImageTaskStatus`, `ImageTaskType`, `ImageWorkspace`, `CanvasObject`, `ImageAsset`, `ImageVersion`, and `ImageTask`; migration exists at `packages/backend/prisma/migrations/20260623000100_add_image_workspaces/migration.sql`.
- **Image task event protocol without generic tool output:** Achieved in source/tests and local browser QA. Evidence: `packages/backend/src/image-workspaces/image-task-events.ts`, queue/stream tests, frontend `use-image-task-stream.ts`, image workspace tests for event parsing, and local browser QA showing no raw `tool_call`, `tool_result`, `storageKey`, `maskKey`, `providerJob`, or `b64_json` in visible UI.
- **Generate/edit/variation/upscale/background removal provider flows:** Achieved in mocked/unit/integration-level source tests. Evidence: `ImageWorkerService` handles generate and edit-like task types, `openai-image-provider.service.ts` implements generate/edit, asset service creates edit/variation/upscale/background-removal tasks, and worker/provider tests cover these paths. Real provider smoke is missing; no evidence yet proves a real configured OpenAI image call succeeds in deployed runtime.
- **Versioned local edits and masks:** Achieved in source/tests; real provider smoke missing. Evidence: `asset-version-panel.tsx` includes mask drawing/upload UI, `image-assets.controller.ts` exposes mask/edit/revert/download/delete routes, `image-worker-edit.service.spec.ts` verifies edits create child versions and variations do not mutate originals, `image-assets.service.spec.ts` covers mask upload/revert/download/delete. Missing: real edit-with-mask smoke against configured storage/provider.
- **Object storage abstraction and signed previews/downloads:** Achieved in source/tests; production storage smoke missing. Evidence: `local-image-storage.service.ts`, `s3-compatible-image-storage.service.ts`, `image-storage.service.ts`, image asset download/preview routes, and storage tests for signed preview URLs without raw storage keys. Missing: real OSS/S3-compatible upload/preview/download smoke with deployment secrets.
- **Redis queue, worker split, task retry/cancel, progress pub/sub:** Achieved in source/tests and server compose validation. Evidence: `image-queue.service.ts`, `image-worker-runner.ts`, `docker-compose.yml` worker service, `.github/workflows/deploy.yml` worker service, queue tests for atomic claim, cancellation removal, and Redis pub/sub; server-side `docker compose config --quiet` and `docker compose ps` passed. Missing: post-deploy worker processing canary for the current worktree.
- **Admin image configuration and usage/cost controls:** Achieved in source/tests. Evidence: `RuntimeSecretsService.getImageConfig()`, `admin-image-usage-panel.tsx`, admin provider test routes, `image-usage.service.ts`, runtime secrets/admin tests, and admin frontend tests. Missing: real admin-configured provider/storage secrets smoke in deployed runtime.
- **Security and cost controls:** Mostly achieved in source/tests. Evidence: ownership checks, input parsers, MIME/size guards, prompt policy guard, per-user and per-IP quotas, signed preview URLs, sanitized public serializers, safe provider errors, and cost metadata tests. Remaining evidence gap is real deployed smoke for signed previews/downloads and provider costs.
- **Production deployment shape:** Partially achieved. Evidence: Docker/compose topology exists; GitHub Actions deploy workflow builds backend/frontend and mirrors postgres/redis/caddy images; server-side compose validation is green and current deployed core services are healthy. Not complete: current image workspace worktree has not been deployed, so live `/image-workspace` returns 404.
- **Manual verification:** Not complete. Local browser QA with mock backend passed desktop/mobile render checks, but the spec's manual real workflow checks (generate image, refresh and restore canvas, pan/zoom several images, edit selected region and compare versions, delete asset, missing provider config/quota exceeded) still need to run against the deployed current worktree and real provider/storage configuration.

Audit conclusion: implementation is substantially present in source and automated tests, but the objective is not complete. The remaining proof gates are real provider/storage smoke, deployment of the current worktree, post-deploy `/image-workspace` live canary, and real/manual workflow confirmation.

Immediate continuation point:

1. Run real provider/storage smoke checks with configured image and OSS/S3 secrets, including generate, uploaded source preview, edit with mask, variation, upscale, background removal, download, and preview.
2. Build, push, and deploy the current image workspace worktree before the final live canary. Server-side Docker compose validation is green, but the currently deployed frontend image does not include `/image-workspace`.
3. Before committing, re-run targeted backend/frontend tests and builds for the final diff, plus browser QA on desktop and mobile.
4. Do a final requirement-by-requirement completion audit against the spec before marking the goal complete.

## Completed Continuation Plan: Reliable Canceled Redis Queue Removal

This slice fixed a cancellation edge case introduced by the Redis list-backed queue. `ImageQueueService.remove(taskId)` previously removed list entries only when it could reconstruct the full queued payload from the JSON compatibility snapshot. If the API process restarted, the snapshot was missing, or the snapshot was stale while the Redis list still contained the pending payload, canceling a queued task could mark the database row as `canceled` but leave the Redis list item claimable by a worker.

The fix is to remove pending Redis list items by JSON field (`taskId`) directly, without depending on the compatibility JSON snapshot. Keep the existing JSON snapshot and in-memory paths as fallbacks for local development and older tests.

**Files:**
- Modify: `packages/backend/src/cache/redis.service.ts`
- Modify: `packages/backend/src/cache/redis.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-queue.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-queue.service.spec.ts`
- Reference: `packages/backend/src/image-workspaces/image-workspaces.service.ts`

- [x] **Step R1: Write the failing queue test**

Add this test to `packages/backend/src/image-workspaces/image-queue.service.spec.ts`:

```ts
  it("removes canceled Redis list tasks when the JSON queue snapshot is missing", async () => {
    const redis = createRedis();
    await redis.pushListJson("mira:image-task:queue", {
      taskId: "task-cancel",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
    const apiQueue = new ImageQueueService(redis);
    const workerQueue = new ImageQueueService(redis);

    await apiQueue.remove("task-cancel");

    await expect(workerQueue.claimNext()).resolves.toBeNull();
  });
```

- [x] **Step R2: Run the red test**

Run:

```bash
pnpm --filter @rednote/backend test -- image-queue
```

Expected before implementation: FAIL because `remove("task-cancel")` reads an empty JSON queue snapshot, never calls `removeListJson()`, and `claimNext()` still pops the Redis list item for `task-cancel`.

- [x] **Step R3: Add an atomic Redis helper for JSON list field removal**

Update `packages/backend/src/cache/redis.service.ts` so `RedisClient` includes `eval`:

```ts
  eval(
    script: string,
    numKeys: number,
    key: string,
    field: string,
    value: string
  ): Promise<unknown>;
```

Add this method to `RedisService`:

```ts
  async removeListJsonByField(key: string, field: string, value: string) {
    const script = `
      local key = KEYS[1]
      local field = ARGV[1]
      local expected = ARGV[2]
      local values = redis.call("LRANGE", key, 0, -1)
      local removed = 0
      for _, item in ipairs(values) do
        local ok, decoded = pcall(cjson.decode, item)
        if ok and decoded[field] == expected then
          removed = removed + redis.call("LREM", key, 0, item)
        end
      end
      return removed
    `;
    await this.getClient().eval(script, 1, key, field, value);
  }
```

Add a focused Redis service test in `packages/backend/src/cache/redis.service.spec.ts`:

```ts
  it("removes JSON list values by object field", async () => {
    const client = new FakeRedisClient();
    const service = new RedisService(() => client, "redis://redis:6379");

    await service.pushListJson("queue", { taskId: "task-1" }, 300);
    await service.pushListJson("queue", { taskId: "task-2" }, 300);
    await service.removeListJsonByField("queue", "taskId", "task-1");

    await expect(service.popListJson("queue")).resolves.toEqual({
      taskId: "task-2"
    });
    await expect(service.popListJson("queue")).resolves.toBeNull();
  });
```

Update `FakeRedisClient` in the same spec with:

```ts
  readonly eval = jest.fn(
    (
      _script: string,
      _numKeys: number,
      key: string,
      field: string,
      value: string
    ) => {
      const list = this.lists.get(key) ?? [];
      const filtered = list.filter((item) => {
        try {
          return JSON.parse(item)?.[field] !== value;
        } catch {
          return true;
        }
      });
      this.lists.set(key, filtered);
      return Promise.resolve(list.length - filtered.length);
    }
  );
```

- [x] **Step R4: Teach `ImageQueueService.remove()` to remove by `taskId` first**

Update the Redis list capability type in `packages/backend/src/image-workspaces/image-queue.service.ts`:

```ts
type ListRedis = Pick<
  RedisService,
  "popListJson" | "pushListJson" | "removeListJson" | "removeListJsonByField"
>;
```

Replace the Redis branch inside `remove(taskId)` with:

```ts
    if (this.redis?.removeListJsonByField) {
      try {
        await this.redis.removeListJsonByField(
          IMAGE_TASK_QUEUE_KEY,
          "taskId",
          taskId
        );
      } catch {
        await Promise.all(
          queue
            .filter((payload) => payload.taskId === taskId)
            .map((payload) => this.removeQueueItem(payload))
        );
      }
    } else if (this.redis?.removeListJson) {
      await Promise.all(
        queue
          .filter((payload) => payload.taskId === taskId)
          .map((payload) => this.removeQueueItem(payload))
      );
    }
```

Keep the final JSON compatibility snapshot update:

```ts
    await this.writeQueue(queue.filter((payload) => payload.taskId !== taskId));
```

Update `createRedis()` in `packages/backend/src/image-workspaces/image-queue.service.spec.ts` with a matching mock:

```ts
    removeListJsonByField: jest.fn((key: string, field: string, value: string) => {
      const list = lists.get(key) ?? [];
      const filtered = list.filter((item) => {
        const record = item as Record<string, unknown>;
        return record[field] !== value;
      });
      lists.set(key, filtered);
      return Promise.resolve();
    }),
```

- [x] **Step R5: Run focused green verification**

Run:

```bash
pnpm --filter @rednote/backend test -- image-queue
pnpm --filter @rednote/backend test -- redis.service
pnpm --filter @rednote/backend test -- image-queue image-task-stream
```

Expected after implementation: PASS. Queue tests should prove cancellation removes Redis list items even when the JSON queue snapshot is missing. Redis service tests should prove the Lua-backed helper removes matching JSON objects and leaves nonmatching entries intact.

- [x] **Step R6: Run broader backend verification**

Run:

```bash
pnpm --filter @rednote/backend test -- redis.service image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Expected: PASS, backend build completes, `git diff --check` prints nothing, and the untracked-file conflict/trailing-whitespace scan prints nothing.

- [x] **Step R7: Record the green result in this plan**

After the implementation is verified, add a new entry immediately above this pending plan:

````markdown
Latest green verification from the canceled Redis queue removal continuation:

```bash
pnpm --filter @rednote/backend test -- image-queue
pnpm --filter @rednote/backend test -- redis.service
pnpm --filter @rednote/backend test -- image-queue image-task-stream
pnpm --filter @rednote/backend test -- redis.service image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: canceling a task with only a Redis list entry and no JSON queue snapshot left the pending list item claimable by workers.

Green result after implementation: Redis-backed queue removal deletes pending list items by `taskId` directly, the JSON compatibility snapshot remains filtered, and split API/worker cancellation no longer depends on reconstructing the full queue payload before `LREM`.
````

## Completed Continuation Plan: Asset Task Request IP Guard

This implementation slice closed the remaining quota-policy gap between text-to-image generation tasks and asset-based tasks. Text-to-image task creation already normalized request IP in `ImageWorkspacesController` and passed it into `ImageUsageService.assertCanCreateTask()`. Asset task creation now applies the same behavior through `ImageAssetsController` and `ImageAssetsService`.

**Files:**
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Test: `packages/backend/src/image-workspaces/image-assets.controller.spec.ts`
- Test: `packages/backend/src/image-workspaces/image-assets.service.spec.ts`
- Reference: `packages/backend/src/image-workspaces/image-workspaces.controller.ts`

- [x] **Step C1: Confirm the focused red tests**

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets.controller image-assets.service
```

Expected before implementation: FAIL because `ImageAssetsController` calls `createEditTask`, `createVariationTask`, `createUpscaleTask`, and `createBackgroundRemovalTask` without request IP, and `ImageAssetsService` calls `ImageUsageService.assertCanCreateTask()` without `requestIp` for those asset task paths.

- [x] **Step C2: Add request IP extraction to the asset controller**

Update `packages/backend/src/image-workspaces/image-assets.controller.ts` so the four asset task endpoints pass the normalized request IP:

```ts
  @Post(":assetId/edit")
  async edit(
    @Req() request: Request,
    @Param("assetId") assetId: string,
    @Body() body: ImageAssetEditRequest
  ) {
    const user = await this.requireUser(request);
    return this.assets.createEditTask(
      user.id,
      assetId,
      body,
      readRequestIp(request)
    );
  }

  @Post(":assetId/variations")
  async variation(@Req() request: Request, @Param("assetId") assetId: string) {
    const user = await this.requireUser(request);
    return this.assets.createVariationTask(user.id, assetId, readRequestIp(request));
  }

  @Post(":assetId/upscale")
  async upscale(@Req() request: Request, @Param("assetId") assetId: string) {
    const user = await this.requireUser(request);
    return this.assets.createUpscaleTask(user.id, assetId, readRequestIp(request));
  }

  @Post(":assetId/remove-background")
  async removeBackground(
    @Req() request: Request,
    @Param("assetId") assetId: string
  ) {
    const user = await this.requireUser(request);
    return this.assets.createBackgroundRemovalTask(
      user.id,
      assetId,
      readRequestIp(request)
    );
  }
```

Add the helper at the bottom of the same file, matching the existing behavior in `ImageWorkspacesController`:

```ts
function readRequestIp(request: Request): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const forwardedIp = rawForwarded?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp;

  return request.ip?.trim() || request.socket.remoteAddress?.trim() || undefined;
}
```

- [x] **Step C3: Thread request IP through asset task service methods**

Update `packages/backend/src/image-workspaces/image-assets.service.ts` method signatures and transform helper:

```ts
  async createEditTask(
    userId: string,
    assetId: string,
    request: ImageAssetEditRequest,
    requestIp?: string
  ) {
```

```ts
  async createVariationTask(userId: string, assetId: string, requestIp?: string) {
```

```ts
  async createUpscaleTask(userId: string, assetId: string, requestIp?: string) {
    return this.createAssetTransformTask(userId, assetId, {
      prompt: UPSCALE_PROMPT,
      sizeForVersion: selectUpscaleSize,
      type: "upscale"
    }, requestIp);
  }

  async createBackgroundRemovalTask(
    userId: string,
    assetId: string,
    requestIp?: string
  ) {
    return this.createAssetTransformTask(userId, assetId, {
      prompt: BACKGROUND_REMOVAL_PROMPT,
      sizeForVersion: () => "auto",
      type: "background_removal"
    }, requestIp);
  }
```

```ts
  private async createAssetTransformTask(
    userId: string,
    assetId: string,
    action: {
      prompt: string;
      sizeForVersion: (version: ImageVersionRecord) => ImageGenerateSize;
      type: "upscale" | "background_removal";
    },
    requestIp?: string
  ) {
```

- [x] **Step C4: Include normalized request IP in usage guard contexts**

In `createEditTask`, `createVariationTask`, and `createAssetTransformTask`, compute:

```ts
    const normalizedRequestIp = requestIp?.trim() || undefined;
```

Pass it to the usage guard only when present:

```ts
    await this.usage?.assertCanCreateTask(userId, {
      workspaceId: asset.workspaceId,
      ...(normalizedRequestIp ? { requestIp: normalizedRequestIp } : {}),
      request: {
        type: "edit",
        prompt,
        assetId: asset.id,
        versionId: sourceVersion.id,
        ...(maskKey ? { maskKey } : {})
      }
    });
```

Use the same spread pattern for variation, upscale, and background removal. Do not persist `requestIp` into the task input for asset tasks unless a later product decision explicitly requires audit visibility; the immediate requirement is quota enforcement, not exposing request metadata.

- [x] **Step C5: Run focused green verification**

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets.controller image-assets.service
```

Expected after implementation: PASS.

- [x] **Step C6: Run broader backend image workspace verification**

Run:

```bash
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Expected: PASS, backend build succeeds, `git diff --check` emits no output, and the untracked-file conflict/trailing-whitespace scan emits no matches.

- [x] **Step C7: Record the red/green result in this plan**

After verification, append a short entry above this section using this format:

````markdown
Latest green verification from the asset task request-IP continuation:

```bash
pnpm --filter @rednote/backend test -- image-assets.controller image-assets.service
pnpm --filter @rednote/backend test -- image-agent image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue image-task-stream
pnpm build:backend
git diff --check
git ls-files --others --exclude-standard | tr '\n' '\0' | xargs -0 rg -n "^(<<<<<<<|=======|>>>>>>>)|[[:blank:]]$"
```

Red result before implementation: asset controller/service tests failed because asset task creation did not pass normalized request IP into `ImageUsageService.assertCanCreateTask()`.

Green result after implementation: focused asset controller/service tests passed, broader backend image workspace suites passed, backend production build completed, and whitespace/conflict scans produced no output. Edit, variation, upscale, and background-removal task creation now enforce per-IP quota consistently with text-to-image generation tasks.
````

## Remaining Production Verification Plan

These gates must remain open until the feature has been exercised with real infrastructure. Do not mark the image workspace goal complete before all of them are recorded in this plan.

- [ ] **Real provider/storage smoke: generate**

Prerequisites: admin database settings contain `IMAGE_PROVIDER`, `OPENAI_IMAGE_API_KEY`, `OPENAI_IMAGE_MODEL`, `IMAGE_STORAGE_PROVIDER`, `IMAGE_STORAGE_BUCKET`, `IMAGE_STORAGE_REGION`, `IMAGE_STORAGE_ENDPOINT`, `IMAGE_STORAGE_ACCESS_KEY`, and `IMAGE_STORAGE_SECRET_KEY`.

Run through the UI or an authenticated HTTP client:

```text
Create an image workspace.
Generate one 1024x1024 image with a harmless prompt.
Wait for the task stream to emit complete.
Verify an image asset appears on canvas.
Refresh the page and verify the asset and canvas geometry persist.
```

Expected: no raw provider payload, storage key, or mask key appears in visible UI or public API serializers.

- [ ] **Real provider/storage smoke: source upload and preview**

Run:

```text
Upload one PNG/JPEG/WebP source image from the image workspace panel.
Open the same-origin preview URL for the created asset.
Refresh the workspace.
Verify the uploaded source image still hydrates on the canvas.
```

Expected: preview/download routes use signed same-origin URLs and do not expose raw object-storage keys.

- [ ] **Real provider/storage smoke: edit with mask**

Run:

```text
Select an image asset.
Draw a small mask.
Submit an edit prompt.
Wait for asset-version-created and complete events.
Open the version panel and compare the original with the edited version.
```

Expected: the original binary remains available, the edit creates a new `ImageVersion`, and the user-facing task copy remains safe.

- [ ] **Real provider/storage smoke: variation, upscale, background removal**

Run:

```text
Create a variation from the selected asset.
Create an upscale version from the selected asset.
Create a background-removal version from the selected asset.
Verify every task creates a new version instead of mutating the original.
```

Expected: each task enforces provider config, prompt policy, user quota, and IP quota before persistence.

- [ ] **Real provider/storage smoke: download**

Run:

```text
Download the current version.
Download a historical version from the version panel.
Open both downloaded files locally.
```

Expected: downloads use signed preview/download URLs and return image bytes with correct MIME types.

- [ ] **Docker compose validation**

Run on a machine with Docker installed:

```bash
docker --version
docker compose version
docker compose config --quiet
```

Expected: Docker CLI is available and the compose config validates. Local macOS verification currently cannot satisfy this gate because `docker` is not installed in this environment.

- [ ] **Live deployment smoke**

After deployment, run:

```text
Open the production Mira URL.
Log in as a normal user.
Open /image-workspace.
Create or select an image workspace.
Run one cheap image task.
Verify backend, worker, postgres, redis, and caddy containers are healthy.
Check backend and worker logs for uncaught exceptions.
```

Expected: the split `backend` and `worker` services share Redis-backed task state, the frontend can stream task updates, and production logs do not contain repeated provider/storage/Prisma errors.

## Final Completion Audit

Before committing or pushing the image workspace feature, audit the implementation against `docs/superpowers/specs/2026-06-23-mira-image-agent-canvas-design.md` with this checklist:

- [ ] Dedicated image workspace route exists and does not replace text chat.
- [ ] Desktop layout has workspace rail, canvas, and inspector/prompt panel.
- [ ] Mobile layout exposes workspace and generation controls through drawers without horizontal overflow.
- [ ] Canvas uses tldraw through the local adapter boundary and persists geometry plus viewport.
- [ ] Backend stores image workspaces, canvas objects, assets, versions, and tasks in image-specific Prisma models.
- [ ] All public image workspace and asset endpoints require user sessions except signed preview tokens.
- [ ] Workspace ownership is enforced for workspaces, tasks, assets, versions, masks, downloads, and task streams.
- [ ] Soft-deleted workspaces block asset operations.
- [ ] Canvas updates reject asset IDs from other workspaces.
- [ ] Generated, uploaded, edited, varied, upscaled, and background-removed images are stored outside PostgreSQL.
- [ ] Public serializers and visible UI hide raw storage keys, mask keys, provider payloads, and tool results.
- [ ] Image task stream supports `task-created`, `task-progress`, `asset-placeholder`, `asset-created`, `asset-version-created`, `canvas-updated`, `usage`, and `error`.
- [ ] Edit-like operations create new versions and keep original binaries available.
- [ ] Retry creates a new task from the original task input.
- [ ] Cancel prevents queued processing and prevents post-provider writes after cancellation.
- [ ] Provider keys and image storage secrets are read from database-backed admin runtime settings, not `.env`.
- [ ] Admin can test image provider configuration without exposing secret values.
- [ ] Admin can view image usage and estimated cost summaries.
- [ ] Prompt policy, provider kill switch, user quota, IP quota, MIME validation, and size validation run before queued task persistence.
- [ ] Docker deployment includes separate HTTP backend and worker services using the same backend image.
- [ ] Backend tests, frontend tests, backend build, frontend build, browser QA, Docker validation, real provider/storage smoke, and live deployment smoke are all recorded as green.

## File Structure

Backend foundation:

- Modify `packages/backend/prisma/schema.prisma`: image workspace enums/models and `User` relations.
- Create `packages/backend/prisma/migrations/20260623000100_add_image_workspaces/migration.sql`: SQL tables, indexes, and enum creation.
- Maintain `packages/backend/src/image-workspaces/image-workspaces.types.ts`: request parsers, serializers, and JSON normalization.
- Maintain `packages/backend/src/image-workspaces/image-workspaces.service.ts`: workspace CRUD, canvas replacement, queued task creation, ownership enforcement.
- Maintain `packages/backend/src/image-workspaces/image-workspaces.controller.ts`: authenticated public API.
- Maintain `packages/backend/src/image-workspaces/image-workspaces.module.ts`: Nest module registration.
- Modify `packages/backend/src/app.module.ts`: import `ImageWorkspacesModule`.
- Modify `packages/backend/src/admin/admin.types.ts` and `packages/backend/src/admin/runtime-secrets.service.ts`: database-backed image config keys.

Backend provider, queue, and storage:

- Create `packages/backend/src/image-workspaces/image-provider.types.ts`: typed provider adapter contract.
- Create `packages/backend/src/image-workspaces/openai-image-provider.service.ts`: OpenAI image generate/edit adapter.
- Create `packages/backend/src/image-workspaces/image-storage.types.ts`: stored image and signed URL contracts.
- Create `packages/backend/src/image-workspaces/image-storage.service.ts`: storage facade.
- Create `packages/backend/src/image-workspaces/local-image-storage.service.ts`: development filesystem storage.
- Create `packages/backend/src/image-workspaces/s3-compatible-image-storage.service.ts`: production OSS/S3-compatible storage.
- Create `packages/backend/src/image-workspaces/image-queue.service.ts`: Redis queue, locks, status updates, and progress fanout.
- Create `packages/backend/src/image-workspaces/image-worker.service.ts`: task runner for generate/edit/variation/upscale/background removal.
- Create `packages/backend/src/image-workspaces/image-assets.controller.ts`: edit, variations, download, delete, and signed preview endpoints.
- Create `packages/backend/src/image-workspaces/image-task-stream.controller.ts`: progress stream endpoint.

Frontend:

- Maintain `packages/web-frontend/src/app/image-workspace/page.tsx`: auth-gated route that defers the heavy canvas shell through `next/dynamic` until after the session state resolves.
- Maintain `packages/web-frontend/src/app/image-workspace/types.ts`: workspace, canvas object, asset, version, task, and event types.
- Maintain `packages/web-frontend/src/app/image-workspace/workspace-api.ts`: same-origin API client.
- Maintain `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`: list/select/create/rename/delete/update/generate state.
- Maintain `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`: tldraw adapter boundary, image-shape hydration, canvas selection bridge, and throttled-frame readiness fallback.
- Maintain `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`: page-level state coordination, mobile drawer state, workspace selection bridge, and layout composition.
- Maintain focused image workspace components:
  - `components/workspace-rail.tsx`
  - `components/canvas-toolbar.tsx`
  - `components/prompt-panel.tsx`
  - `components/task-inspector.tsx`
  - `components/asset-version-panel.tsx`
  - `components/mobile-drawers.tsx`
  - `components/inspector-panel.tsx`
- Add `packages/web-frontend/src/app/image-workspace/use-image-task-stream.ts`: progress stream subscription.
- Add `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`: debounced canvas save and unload flush.
- Add `packages/web-frontend/src/app/image-workspace/use-selected-image-asset.ts`: selection-derived asset controls.
- Maintain Next proxy routes under `packages/web-frontend/src/app/api/image-workspaces/`.
- Maintain Next proxy routes under `packages/web-frontend/src/app/api/image-assets/`, including the same-origin preview route.
- Add source upload route `packages/web-frontend/src/app/api/image-workspaces/[id]/assets/route.ts` when implementing Task 7B.

Tests:

- Backend unit tests live next to image workspace services as `*.spec.ts`.
- Frontend source contract tests live next to route/components as `*.test.mjs`.
- Browser QA uses the in-app browser against `http://localhost:3000/image-workspace`.

## Task 1: Stabilize The Foundation Slice

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`
- Modify if needed: `packages/web-frontend/package.json`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Reproduce the tldraw browser error**

Run the app with a local or mock backend, open `http://localhost:3000/image-workspace`, and record whether the browser console still emits:

```text
AtomMap: key [object Object] not found
```

Expected: the page renders the route, and the console result is known before changing code.

- [ ] **Step 2: Make the tldraw mount deterministic**

Update `ImageCanvas` so each workspace owns a stable editor persistence key and the editor is mounted only when the container is ready:

```tsx
const persistenceKey = workspace ? `mira-image-workspace:${workspace.id}` : null;

return (
  <div className="relative h-full w-full overflow-hidden bg-[var(--surface-muted)]">
    {canvasReady && persistenceKey ? (
      <Tldraw key={persistenceKey} persistenceKey={persistenceKey} />
    ) : null}
    {loading || !workspace || !canvasReady ? (
      <div className="pointer-events-none absolute inset-x-4 top-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted-strong)]">
        {loading || !canvasReady ? "正在加载图像画布" : "创建一个图像工作区后开始"}
      </div>
    ) : null}
  </div>
);
```

- [ ] **Step 3: Add a contract test for deterministic canvas mounting**

Extend `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs` with an assertion that `image-canvas.tsx` passes `persistenceKey` to `Tldraw` and keys the editor by workspace id.

- [ ] **Step 4: Run targeted frontend tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
```

Expected: PASS.

- [ ] **Step 5: Browser verify desktop and mobile**

Open `http://localhost:3000/image-workspace` through the in-app browser. Verify:

- Workspace rail is visible on desktop.
- Canvas fills the center panel.
- Prompt/task panel is visible on desktop.
- Mobile workspace and generation controls are reachable through icon buttons.
- Console has no recurring tldraw runtime errors.

## Task 2: Finish Backend Foundation Verification

**Files:**
- Modify if needed: `packages/backend/src/image-workspaces/image-workspaces.types.ts`
- Modify if needed: `packages/backend/src/image-workspaces/image-workspaces.service.ts`
- Modify if needed: `packages/backend/src/image-workspaces/image-workspaces.controller.ts`
- Test: `packages/backend/src/image-workspaces/image-workspaces.types.spec.ts`
- Test: `packages/backend/src/image-workspaces/image-workspaces.service.spec.ts`

- [ ] **Step 1: Verify parser coverage**

Confirm tests cover:

- trimmed non-empty workspace titles;
- invalid empty workspace titles;
- valid canvas viewport and finite geometry;
- invalid canvas snapshots;
- nullable or non-record `CanvasObject.props` serialization;
- valid generate/edit task requests;
- invalid blank prompts.

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types
```

Expected: PASS.

- [ ] **Step 2: Verify service ownership coverage**

Confirm tests cover:

- `list(userId)` returns only active, non-deleted workspaces owned by the user;
- `get(userId, id)` rejects another user's workspace;
- `rename(userId, id, title)` rejects another user's workspace;
- `remove(userId, id)` soft deletes only the current user's workspace;
- `updateCanvas(userId, id, snapshot)` replaces canvas objects inside one transaction;
- `createTask(userId, workspaceId, request)` creates a queued task owned by the current user.

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service
```

Expected: PASS.

- [ ] **Step 3: Generate Prisma client and run backend build**

Run:

```bash
pnpm --filter @rednote/backend prisma:generate
pnpm build:backend
```

Expected: Prisma generation and TypeScript build both pass.

## Task 3: Add Provider And Storage Contracts

**Files:**
- Create: `packages/backend/src/image-workspaces/image-provider.types.ts`
- Create: `packages/backend/src/image-workspaces/image-storage.types.ts`
- Create: `packages/backend/src/image-workspaces/image-provider.types.spec.ts`
- Create: `packages/backend/src/image-workspaces/image-storage.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.module.ts`

- [x] **Step 1: Add provider type tests**

Create tests that assert generate/edit inputs accept only supported sizes and that provider results always include binary bytes, MIME type, dimensions, provider name, and metadata.

Use this contract:

```ts
export type ImageGenerateInput = {
  prompt: string;
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality: "low" | "medium" | "high" | "auto";
  background: "transparent" | "opaque" | "auto";
};

export type StoredImageRef = {
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type ImageEditInput = {
  prompt: string;
  image: StoredImageRef;
  mask?: StoredImageRef;
  size: ImageGenerateInput["size"];
};

export type ImageProviderResult = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  provider: string;
  providerJob: string | null;
  metadata: Record<string, unknown>;
};

export interface ImageProviderAdapter {
  generate(input: ImageGenerateInput): Promise<ImageProviderResult>;
  edit(input: ImageEditInput): Promise<ImageProviderResult>;
}
```

- [x] **Step 2: Add storage type tests**

Create tests that assert storage writes return a `StoredImageRef`, signed preview URLs never expose raw provider keys, and invalid MIME types are rejected before writing.

Use this contract:

```ts
export type StoreImageInput = {
  userId: string;
  workspaceId: string;
  taskId: string;
  filename: string;
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

export interface ImageStorageService {
  putImage(input: StoreImageInput): Promise<StoredImageRef>;
  getImage(ref: StoredImageRef): Promise<Buffer>;
  createSignedPreviewUrl(ref: StoredImageRef): Promise<string>;
  deleteImage(ref: StoredImageRef): Promise<void>;
}
```

- [x] **Step 3: Implement contracts without provider calls**

Add the type files and dependency tokens. Register a development storage provider in `ImageWorkspacesModule` that can be replaced by OSS in production.

Current status: `ImageWorkspacesModule` binds `IMAGE_STORAGE` to `ConfiguredImageStorageService`. The facade delegates to `LocalImageStorageService` when `IMAGE_STORAGE_PROVIDER=local` and to `S3CompatibleImageStorageService` when `IMAGE_STORAGE_PROVIDER=oss`, `s3`, or `s3-compatible`.

- [x] **Step 4: Run provider/storage tests**

Run:

```bash
pnpm --filter @rednote/backend test -- image-provider image-storage
```

Expected: PASS.

## Task 4: Add OpenAI Image Provider

**Files:**
- Create: `packages/backend/src/image-workspaces/openai-image-provider.service.ts`
- Create: `packages/backend/src/image-workspaces/openai-image-provider.service.spec.ts`
- Modify: `packages/backend/src/admin/admin.types.ts`
- Modify: `packages/backend/src/admin/runtime-secrets.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.module.ts`

- [ ] **Step 1: Write provider tests with a mocked OpenAI client**

Tests must cover:

- missing `OPENAI_IMAGE_API_KEY` returns a safe config error;
- generate maps Mira settings to the configured image model;
- edit includes source image and optional mask;
- provider error becomes a short user-safe message;
- raw API key is never included in thrown errors.

- [ ] **Step 2: Implement `OpenAIImageProviderService`**

Use admin database-backed runtime secrets. Do not read image provider keys from `.env`.

Provider settings:

```ts
const imageConfigKeys = [
  "OPENAI_IMAGE_API_KEY",
  "OPENAI_IMAGE_MODEL",
  "IMAGE_PROVIDER",
  "IMAGE_DEFAULT_QUALITY",
  "IMAGE_MAX_IMAGE_SIZE_MB"
] as const;
```

- [ ] **Step 3: Add admin validation helper**

Add a backend method that returns whether image generation is configured without returning secret values.

Public response shape:

```ts
{
  configured: boolean;
  provider: "openai" | "disabled";
  model: string | null;
  missingKeys: string[];
}
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
pnpm --filter @rednote/backend test -- openai-image-provider runtime-secrets
```

Expected: PASS.

## Task 5: Add Task Worker And Progress Stream

**Files:**
- Create: `packages/backend/src/image-workspaces/image-queue.service.ts`
- Create: `packages/backend/src/image-workspaces/image-worker.service.ts`
- Create: `packages/backend/src/image-workspaces/image-task-stream.controller.ts`
- Create: `packages/backend/src/image-workspaces/image-worker.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.module.ts`

- [ ] **Step 1: Write worker lifecycle tests**

Tests must prove:

- creating a generate task stores status `queued`;
- worker changes task status to `running`;
- successful generation creates `ImageAsset`, `ImageVersion`, and `CanvasObject`;
- successful generation changes task status to `complete`;
- provider failure stores status `failed` and a safe `error`;
- progress events contain no raw provider responses or secret values.

- [ ] **Step 2: Implement queue service**

Redis keys:

```text
mira:image-task:queue
mira:image-task:lock:<taskId>
mira:image-task:events:<taskId>
```

Queue payload:

```ts
type ImageTaskQueuePayload = {
  taskId: string;
  workspaceId: string;
  userId: string;
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal";
};
```

- [ ] **Step 3: Implement worker service**

Worker behavior:

- loads the task by id and user id;
- validates the workspace still exists;
- calls the provider adapter;
- writes bytes to image storage;
- creates image asset/version metadata in PostgreSQL;
- creates or updates the canvas object;
- emits progress events after every durable state change.

- [ ] **Step 4: Add progress stream endpoint**

Expose:

```text
GET /image-workspaces/:id/tasks/:taskId/stream
```

The stream sends NDJSON or SSE events with this public shape:

```ts
type ImageTaskEvent =
  | { type: "task-progress"; taskId: string; status: string; message: string }
  | { type: "asset-created"; taskId: string; assetId: string; versionId: string; objectId: string }
  | { type: "error"; taskId: string; message: string };
```

- [ ] **Step 5: Run worker tests**

Run:

```bash
pnpm --filter @rednote/backend test -- image-worker image-queue image-task-stream
```

Expected: PASS.

## Task 6: Connect Frontend Task Streaming And Generated Assets

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/types.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`
- Create: `packages/web-frontend/src/app/image-workspace/use-image-task-stream.ts`
- Create: `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Split/modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Add frontend event contract tests**

Tests must prove:

- task creation starts stream subscription for the returned task id;
- task progress updates the task panel;
- `asset-created` reloads the active workspace;
- stream errors render as red user-readable text below the prompt/task area;
- raw `tool_call`, `tool_result`, provider JSON, and stack traces are not rendered.

- [ ] **Step 2: Implement `useImageTaskStream`**

Use `fetch` with `ReadableStream` parsing for NDJSON or `EventSource` for SSE. The hook accepts:

```ts
type UseImageTaskStreamInput = {
  workspaceId: string;
  taskId: string | null;
  onEvent: (event: ImageTaskEvent) => void;
  onError: (message: string) => void;
};
```

- [ ] **Step 3: Persist canvas changes**

Implement debounced canvas persistence. The save payload must match backend `CanvasSnapshot`:

```ts
type CanvasSnapshot = {
  viewport: { x: number; y: number; zoom: number } | null;
  objects: Array<{
    id: string;
    assetId: string | null;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
    props: Record<string, unknown>;
  }>;
};
```

- [ ] **Step 4: Render generated assets on tldraw**

The adapter maps backend image assets to tldraw image shapes. It must preserve backend object ids so refresh restores placement.

- [ ] **Step 5: Run frontend tests and browser QA**

Run:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
```

Expected: PASS.

Browser verify:

- prompt creates a task;
- task progress is visible;
- generated image appears on the canvas;
- refresh restores canvas state;
- mobile drawers keep controls reachable.

## Task 6A: Lock Down Image Preview And Canvas Selection Bridge

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`
- Create: `packages/web-frontend/src/app/api/image-assets/[assetId]/preview/route.ts`
- Modify: `packages/web-frontend/src/app/api/image-assets/proxy.test.mjs`
- Modify: `packages/backend/src/image-workspaces/image-storage.types.ts`
- Modify: `packages/backend/src/image-workspaces/local-image-storage.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-storage.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.spec.ts`

- [x] **Step 1: Add frontend source contract tests for tldraw hydration**

The test must assert that `image-canvas.tsx` contains the bridge points that protect this behavior:

```js
assert.match(canvasSource, /hydrateWorkspaceImages/);
assert.match(canvasSource, /AssetRecordType\.create/);
assert.match(canvasSource, /createShapeId/);
assert.match(canvasSource, /miraAssetId/);
assert.match(canvasSource, /createImageAssetPreviewUrl/);
assert.match(canvasSource, /editor\.store\.listen/);
assert.match(canvasSource, /onSelectAsset/);
```

Run:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
```

Expected: PASS.

- [x] **Step 2: Hydrate backend canvas objects into tldraw image shapes**

`hydrateWorkspaceImages(editor, workspace)` must:

- find each `CanvasObject` with an `assetId`;
- find the matching `ImageAsset.currentVersionId`;
- create a stable tldraw asset id from Mira asset/version ids;
- create a stable tldraw shape id from Mira canvas object id;
- store `miraAssetId`, `miraObjectId`, and `miraVersionId` in tldraw metadata;
- use `createImageAssetPreviewUrl(asset.id)` for the image source.

- [x] **Step 3: Bridge canvas selection back to Mira asset selection**

`ImageCanvas` receives:

```ts
type ImageCanvasProps = {
  workspace: ImageWorkspace | null;
  loading: boolean;
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string | null) => void;
};
```

The tldraw store listener reads the selected shape, extracts `shape.meta.miraAssetId`, and calls `onSelectAsset(assetId)` or `onSelectAsset(null)` when the selection is cleared. The side panel can also call `editor.setSelectedShapes([shapeId])` when `selectedAssetId` changes.

- [x] **Step 4: Add a same-origin frontend preview route**

Create:

```text
GET /api/image-assets/:assetId/preview
```

The route forwards the user cookie to backend:

```text
GET /image-assets/:assetId/download
```

Expected behavior: backend authorizes ownership, returns a signed preview URL, and the Next route redirects with `302`.

- [x] **Step 5: Add signed local preview token reading**

`LocalImageStorageService` must sign preview payloads with HMAC and read them back through `readSignedPreview(token)`. Token verification must reject tampered tokens with a safe error and must not expose the raw `storageKey` in the signed URL.

- [x] **Step 6: Verify the bridge and preview slice**

Run:

```bash
pnpm --filter @rednote/backend test -- image-storage image-assets.controller image-assets.service
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
```

Expected: PASS.

- [ ] **Step 7: Browser verify the latest slice**

Open `http://localhost:3000/image-workspace` and verify:

- desktop columns render after resetting the viewport;
- the canvas does not go blank after reload;
- selecting a generated image on the canvas opens the version controls;
- selecting an image in the side panel selects the matching canvas object;
- generated image previews load through `/api/image-assets/:assetId/preview`;
- console output has no recurring runtime errors beyond known tldraw zh-cn missing message warnings.

## Task 6B: Wire Frontend Canvas Snapshot Persistence

**Files:**
- Create: `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/page.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

Completion state: the red source-contract test in `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs` was confirmed before implementation, then turned green after `use-canvas-persistence.ts` was created and `workspace.persistCanvas` was passed down to `ImageCanvas`.

- [x] **Step 1: Confirm the red test**

Run:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
```

Observed before implementation: FAIL with `use-canvas-persistence.ts should exist`.

- [x] **Step 2: Create the canvas persistence hook**

Create `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`:

```ts
"use client";

import { useEffect, useRef } from "react";
import type { Editor, TLShape } from "tldraw";
import type { CanvasObject, CanvasSnapshot, ImageWorkspace } from "./types";

const CANVAS_SAVE_DEBOUNCE_MS = 700;

type UseCanvasPersistenceInput = {
  editor: Editor | null;
  workspace: ImageWorkspace | null;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
};

export function useCanvasPersistence({
  editor,
  onPersistCanvas,
  workspace,
}: UseCanvasPersistenceInput) {
  const persistRef = useRef<(snapshot: CanvasSnapshot) => Promise<void> | void>(
    (snapshot) => onPersistCanvas(snapshot),
  );
  const lastSnapshotJsonRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    persistRef.current = (snapshot) => onPersistCanvas(snapshot);
  }, [onPersistCanvas]);

  useEffect(() => {
    if (!editor || !workspace) return;

    const activeEditor = editor;
    lastSnapshotJsonRef.current = JSON.stringify(
      serializeCanvasSnapshot(activeEditor),
    );

    function scheduleSave() {
      const snapshot = serializeCanvasSnapshot(activeEditor);
      const snapshotJson = JSON.stringify(snapshot);
      if (snapshotJson === lastSnapshotJsonRef.current) return;

      lastSnapshotJsonRef.current = snapshotJson;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void persistRef.current(snapshot);
      }, CANVAS_SAVE_DEBOUNCE_MS);
    }

    const unsubscribe = activeEditor.store.listen(scheduleSave);

    return () => {
      unsubscribe();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [editor, workspace?.id]);
}

export function serializeCanvasSnapshot(editor: Editor): CanvasSnapshot {
  const camera = editor.getCamera();
  const objects = editor
    .getCurrentPageShapes()
    .map((shape, index) => serializeImageShape(shape, index))
    .filter((object): object is CanvasObject => object !== null);

  return {
    viewport: {
      x: camera.x,
      y: camera.y,
      zoom: camera.z,
    },
    objects,
  };
}

function serializeImageShape(shape: TLShape, zIndex: number): CanvasObject | null {
  if (shape.type !== "image") return null;

  const objectId = shape.meta?.miraObjectId;
  const assetId = shape.meta?.miraAssetId;
  if (typeof objectId !== "string" || typeof assetId !== "string") return null;

  const props = shape.props as { w?: unknown; h?: unknown };
  const width = normalizeFiniteNumber(props.w, 320);
  const height = normalizeFiniteNumber(props.h, 320);

  return {
    id: objectId,
    assetId,
    type: "image",
    x: normalizeFiniteNumber(shape.x, 0),
    y: normalizeFiniteNumber(shape.y, 0),
    width,
    height,
    rotation: normalizeFiniteNumber(shape.rotation, 0),
    zIndex,
    props: {},
  };
}

function normalizeFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
```

- [x] **Step 3: Pass the persistence callback from the page**

Modify the `ImageWorkspaceShell` call in `packages/web-frontend/src/app/image-workspace/page.tsx`:

```tsx
  return (
    <ImageWorkspaceShell
      activeWorkspace={workspace.activeWorkspace}
      creatingTask={workspace.creatingTask}
      error={workspace.error}
      loading={workspace.loading}
      onCreate={workspace.createWorkspace}
      onCancelTask={workspace.cancelTask}
      onDeleteAsset={workspace.removeImageAsset}
      onDownloadAsset={workspace.downloadAsset}
      onEditAsset={workspace.editImageAsset}
      onGenerate={workspace.generateImage}
      onPersistCanvas={workspace.persistCanvas}
      onRemoveBackgroundAsset={workspace.createImageBackgroundRemoval}
      onRevertAsset={workspace.revertAssetVersion}
      onSelect={workspace.selectWorkspace}
      onUpscaleAsset={workspace.createImageUpscale}
      onUploadMask={workspace.uploadAssetMask}
      onVariationAsset={workspace.createImageVariation}
      workspaces={workspace.workspaces}
    />
  );
```

- [x] **Step 4: Thread the callback through the shell**

Modify `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx` to import `CanvasSnapshot`, accept `onPersistCanvas`, and pass it to `ImageCanvas`:

```tsx
import type { CanvasSnapshot, ImageWorkspace } from "./types";

export function ImageWorkspaceShell({
  activeWorkspace,
  creatingTask,
  error,
  loading,
  onCancelTask,
  onCreate,
  onDeleteAsset,
  onDownloadAsset,
  onEditAsset,
  onGenerate,
  onPersistCanvas,
  onRemoveBackgroundAsset,
  onRevertAsset,
  onSelect,
  onUpscaleAsset,
  onUploadMask,
  onVariationAsset,
  workspaces,
}: {
  activeWorkspace: ImageWorkspace | null;
  creatingTask: boolean;
  error: string | null;
  loading: boolean;
  onCancelTask: (taskId: string) => Promise<void> | void;
  onCreate: () => void;
  onDeleteAsset: (assetId: string) => Promise<void> | void;
  onDownloadAsset: (assetId: string, versionId?: string) => Promise<void> | void;
  onEditAsset: (
    assetId: string,
    prompt: string,
    maskKey?: string,
  ) => Promise<void> | void;
  onGenerate: (prompt: string) => void;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
  onRemoveBackgroundAsset: (assetId: string) => Promise<void> | void;
  onRevertAsset: (assetId: string, versionId: string) => Promise<void> | void;
  onSelect: (id: string) => void;
  onUpscaleAsset: (assetId: string) => Promise<void> | void;
  onUploadMask: (
    assetId: string,
    dataUrl: string,
  ) => Promise<{ maskKey: string; sizeBytes: number }>;
  onVariationAsset: (assetId: string) => Promise<void> | void;
  workspaces: ImageWorkspace[];
}) {
```

Update the canvas call:

```tsx
        <ImageCanvas
          loading={loading}
          onPersistCanvas={onPersistCanvas}
          onSelectAsset={selectAsset}
          selectedAssetId={selectedAssetId}
          workspace={activeWorkspace}
        />
```

- [x] **Step 5: Attach the hook inside `ImageCanvas`**

Modify `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`:

```tsx
import type { CanvasSnapshot, ImageAsset, ImageWorkspace } from "./types";
import { useCanvasPersistence } from "./use-canvas-persistence";

export function ImageCanvas({
  loading,
  onPersistCanvas,
  onSelectAsset,
  selectedAssetId,
  workspace,
}: {
  loading: boolean;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
  onSelectAsset: (assetId: string | null) => void;
  selectedAssetId: string | null;
  workspace: ImageWorkspace | null;
}) {
  const [canvasReady, setCanvasReady] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSelectedAssetRef = useRef<string | null>(null);
  const persistenceKey = workspace ? `mira-image-workspace:${workspace.id}` : null;

  useCanvasPersistence({ editor, onPersistCanvas, workspace });
```

Update `handleMount` so cleanup clears both editor references:

```tsx
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setEditor(editor);
      hydrateWorkspaceImages(editor, workspace);

      const unsubscribe = editor.store.listen(() => {
        const assetId = readSelectedMiraAssetId(editor);
        if (lastSelectedAssetRef.current === assetId) return;

        lastSelectedAssetRef.current = assetId;
        onSelectAsset(assetId);
      });

      return () => {
        unsubscribe();
        editorRef.current = null;
        setEditor(null);
      };
    },
    [onSelectAsset, workspace],
  );
```

- [x] **Step 6: Make canvas save failures user-readable**

Modify `persistCanvas` in `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`:

```ts
  async function persistCanvas(snapshot: CanvasSnapshot) {
    if (!activeWorkspace) return;

    setError(null);
    try {
      replaceWorkspace(await saveCanvasSnapshot(activeWorkspace.id, snapshot));
    } catch (canvasError) {
      const message =
        canvasError instanceof Error ? canvasError.message : "画布保存失败";
      setError(message);
    }
  }
```

- [x] **Step 7: Run the green frontend loop**

Run:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:frontend
git diff --check
```

Observed: PASS for all commands.

- [x] **Step 8: Browser verify canvas persistence**

Use a clean dev server or production Next preview with a mock backend that records `PATCH /image-workspaces/:id/canvas`.

Verify:

- moving or resizing an image emits a debounced canvas snapshot;
- `viewport` stores the tldraw camera as `{ x, y, zoom }`;
- only Mira image shapes with `meta.miraObjectId` and `meta.miraAssetId` are sent;
- refreshing after a saved snapshot restores image placement;
- failed canvas save appears as user-readable red text in the existing error area without exposing provider, storage, or stack details.

Observed in browser QA: moving the image emitted a debounced snapshot with `object-qa`, the viewport update emitted `{ x: 0, y: 650, zoom: 1 }`, the payload contained only the Mira image object, and refresh restored the workspace/image state from the mock backend. Error display remains covered by the hook-level source contract and `persistCanvas` catch path; a failing network canvas-save browser case is still appropriate for a later broader QA pass.

## Task 7: Add Local Edits And Version Panel

**Files:**
- Create: `packages/backend/src/image-workspaces/image-assets.controller.ts`
- Create: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Create: `packages/backend/src/image-workspaces/image-assets.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-worker.service.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/types.ts`
- Create: `packages/web-frontend/src/app/image-workspace/components/asset-version-panel.tsx`
- Create: `packages/web-frontend/src/app/image-workspace/use-selected-image-asset.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Add backend asset tests**

Tests must prove:

- `POST /image-assets/:assetId/edit` rejects assets owned by another user;
- edit task requires a prompt and an existing source version;
- optional mask key must belong to the same user/workspace;
- successful edit creates a new `ImageVersion`;
- original image version remains unchanged;
- revert changes only `ImageAsset.currentVersionId`;
- delete detaches or deletes related canvas objects according to the selected endpoint.

- [ ] **Step 2: Add frontend version panel tests**

Tests must prove:

- selecting an image reveals version controls;
- edit mode accepts a prompt and optional mask;
- compare shows current and previous versions;
- revert calls the correct API route;
- download uses a signed URL route rather than raw storage keys.

- [ ] **Step 3: Implement edit endpoints**

Expose:

```text
POST /image-assets/:assetId/edit
POST /image-assets/:assetId/variations
POST /image-assets/:assetId/revert
GET /image-assets/:assetId/download
DELETE /image-assets/:assetId
```

- [ ] **Step 4: Implement frontend asset panel**

Use compact tool UI:

- icon buttons for edit, variation, compare, download, delete;
- red inline error text below the active control;
- no visible raw provider/tool payloads;
- no custom CSS beyond existing variables and Tailwind utilities.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets image-worker
pnpm --filter @mira/web-frontend test -- image-workspace
```

Expected: PASS.

## Task 7B: Add Local Source Image Uploads

**Files:**
- Modify: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.controller.spec.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/components/prompt-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/components/inspector-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`
- Add: `packages/web-frontend/src/app/api/image-workspaces/[id]/assets/route.ts`
- Modify: `packages/web-frontend/src/app/api/image-workspaces/proxy.test.mjs`

Completion state: implemented locally. Automated verification and desktop/mobile browser QA against a mock backend are green for this slice.

- [x] **Step 1: Add failing backend service tests for source uploads**

Add tests in `packages/backend/src/image-workspaces/image-assets.service.spec.ts` proving that a new service method creates a visible source asset from an uploaded PNG/JPEG/WebP data URL.

The test should use the existing fake Prisma/storage setup pattern in this file and assert:

- owned workspace is required;
- PNG/JPEG/WebP data URLs are accepted;
- non-image data URLs are rejected with `BadRequestException`;
- empty or malformed data URLs are rejected with `BadRequestException`;
- `ImageStorageService.putImage()` receives decoded bytes, normalized MIME type, current `userId`, current `workspaceId`, and a source-upload task id prefix;
- the created `ImageAsset` metadata contains `{ kind: "source_upload" }`;
- the created `ImageVersion` provider is `"mira"` and stores the storage reference internally;
- the public return value is serialized through `serializeImageAsset()` and does not expose `storageKey` or `maskKey`.

Target behavior:

```ts
const result = await service.uploadSourceAsset("user-1", "workspace-1", {
  dataUrl: "data:image/png;base64,aGVsbG8=",
  title: "本地参考图"
});

expect(storage.putImage).toHaveBeenCalledWith(
  expect.objectContaining({
    userId: "user-1",
    workspaceId: "workspace-1",
    filename: "source-upload.png",
    mimeType: "image/png",
    bytes: expect.any(Buffer)
  })
);
expect(result.asset.title).toBe("本地参考图");
expect(result.asset.versions[0]).not.toHaveProperty("storageKey");
expect(result.asset.versions[0]).not.toHaveProperty("maskKey");
```

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets
```

Red result before implementation: FAIL because `uploadSourceAsset()` did not exist on `ImageAssetsService`.

- [x] **Step 2: Implement backend source upload parsing and persistence**

Add request type and parser beside the existing mask upload helpers in `packages/backend/src/image-workspaces/image-assets.service.ts`:

```ts
export type ImageSourceUploadRequest = {
  dataUrl?: unknown;
  title?: unknown;
};
```

Implementation rules:

- accept only `image/png`, `image/jpeg`, and `image/webp`;
- decode base64 data URLs using `Buffer.from(base64, "base64")`;
- reject zero-byte uploads;
- cap uploaded source image size using the same configured max image size used for source/mask validation, or a conservative local fallback if that value is unavailable in this service;
- call `storage.putImage()` with `taskId: "source-upload-" + workspaceId`;
- create an `ImageAsset` in the target workspace with `metadata.kind = "source_upload"`;
- create the first `ImageVersion` with `provider = "mira"`, `prompt = null`, `editPrompt = null`, `maskKey = null`;
- update `ImageAsset.currentVersionId`;
- create a `CanvasObject` for the uploaded image so it appears immediately on the infinite canvas, using a default placement near `{ x: 160, y: 160 }` and dimensions from the stored image if available;
- return `{ asset: serializeImageAsset(asset), workspace: serializeImageWorkspace(workspace) }` or just `{ workspace }` if the frontend should reload from one canonical workspace payload.

Keep hidden mask uploads separate. Source uploads must be visible in public workspace serialization; mask helper assets stay filtered by `metadata.kind === "mask"`.

- [x] **Step 3: Add backend endpoint tests and controller route**

Add controller tests proving the public user session is required and ownership is enforced through the service.

Expose:

```text
POST /image-workspaces/:id/assets
```

Controller shape:

```ts
@Post(":id/assets")
async uploadSourceAsset(
  @Req() request: Request,
  @Param("id") workspaceId: string,
  @Body() body: ImageSourceUploadRequest
) {
  const user = await this.requireUser(request);
  return this.assets.uploadSourceAsset(user.id, workspaceId, body);
}
```

Use the workspace route instead of `POST /image-assets` because a new upload belongs to a workspace before it has an asset id.

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller
```

Green result after implementation: `pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller` passed 29/29.

- [x] **Step 4: Add Next proxy route and frontend API helper**

Create `packages/web-frontend/src/app/api/image-workspaces/[id]/assets/route.ts` following the existing proxy style:

```ts
import { proxyBackendRequest } from "@/app/api/shared/backend-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyBackendRequest(request, `/image-workspaces/${encodeURIComponent(id)}/assets`, {
    method: "POST",
  });
}
```

Add frontend helper in `workspace-api.ts`:

```ts
export async function uploadImageWorkspaceAsset(
  workspaceId: string,
  input: { dataUrl: string; title?: string },
) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(workspaceId)}/assets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  await assertOk(response, "源图上传失败");
  return readJson<{ workspace: ImageWorkspace }>(response);
}
```

Extend `packages/web-frontend/src/app/api/image-workspaces/proxy.test.mjs` to assert the proxy route exists and forwards to `/image-workspaces/:id/assets`.

- [x] **Step 5: Add hook wiring and source upload control**

Add `uploadSourceAsset(file: File)` to `useImageWorkspace()`.

Behavior:

- ignore calls when no active workspace exists or another task/upload is active;
- validate browser MIME type against `image/png`, `image/jpeg`, `image/webp` before reading;
- use `FileReader.readAsDataURL(file)`;
- call `uploadImageWorkspaceAsset(activeWorkspace.id, { dataUrl, title: file.name })`;
- replace the active workspace with the returned workspace;
- surface errors through the existing red prompt-panel error area;
- never render raw storage keys or provider payloads.

Add a compact upload control to `PromptPanel` below the generation button:

```tsx
<label className="mt-2 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[700] transition-colors hover:bg-[var(--surface-muted)]">
  <Upload aria-hidden="true" size={16} />
  上传源图到画布
  <input
    accept="image/png,image/jpeg,image/webp"
    className="sr-only"
    disabled={creatingTask || !activeWorkspace}
    onChange={handleFileChange}
    type="file"
  />
</label>
```

The label can be text because it represents a clear command and needs a discoverable upload affordance. Keep the native input visually hidden with Tailwind `sr-only`.

- [x] **Step 6: Add frontend source-contract tests**

Extend `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs` with source-level assertions that:

- `PromptPanel` contains an `accept="image/png,image/jpeg,image/webp"` file input;
- the upload input is hidden using Tailwind `sr-only`;
- `workspace-api.ts` exports `uploadImageWorkspaceAsset`;
- `use-image-workspace.ts` reads selected files via `FileReader.readAsDataURL`;
- upload success calls `replaceWorkspace` with the returned workspace;
- no test fixture or rendered path includes `storageKey` or `maskKey`.

Run:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
```

Green result after implementation: `pnpm --filter @mira/web-frontend test -- image-workspace proxy.test` passed 106/106.

- [x] **Step 7: Browser QA desktop and mobile with a mock upload**

Run a clean frontend preview and mock backend. Open `http://127.0.0.1:3011/image-workspace`.

Verify:

- desktop right panel shows `上传源图到画布`;
- mobile generation drawer shows the same upload control without horizontal overflow;
- selecting a small PNG/JPEG/WebP file sends `POST /api/image-workspaces/:id/assets`;
- the uploaded asset appears in the asset switcher with same-origin preview URL;
- the canvas hydrates one new tldraw image shape for the uploaded source;
- the visible UI does not show `storageKey`, `maskKey`, provider raw JSON, or tool output.

If browser automation cannot set a file input through the current in-app browser, verify the route with a manual local file selection or a small DOM-injected `File` object, then record that limitation in this plan.

Browser verification status: PASS against a production Next preview with a mock backend.

```text
Target: http://127.0.0.1:3011/image-workspace with mock backend at http://127.0.0.1:3001
Desktop 1280x720: authenticated workspace rendered, right prompt panel showed 上传源图到画布, file input used accept="image/png,image/jpeg,image/webp" and class="sr-only", document/body width stayed 1280px, and no storageKey/maskKey/tool payload text was visible.
Upload fallback: the in-app browser page sandbox did not expose fetch for page-scope upload simulation, so the same-origin Next route was verified from the Node/browser session with a PNG data URL. POST /api/image-workspaces/workspace-qa/assets returned 200, one asset, one canvas object, and no storageKey/maskKey/b64_json in the JSON response.
Post-upload desktop: reload showed uploaded-source.png in the asset switcher, same-origin /api/image-assets/asset-upload-1/preview was used by rendered img tags, and visible UI stayed free of storageKey/maskKey/tool payloads.
Mobile 390x844: 打开生成面板 exposed 上传源图到画布 and uploaded-source.png in the drawer, file input stayed sr-only, document/body width stayed 390px, and no raw internal fields were visible.
Temporary mock backend and Next preview were stopped after QA; ports 3001 and 3011 had no remaining listeners.
```

- [x] **Step 8: Run broader local verification**

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller image-workspaces.service image-usage
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test email-login-panel
pnpm build:backend
pnpm build:frontend
git diff --check
```

Expected: PASS. Do not mark the overall image workspace feature complete until real provider/storage smoke, Docker validation, and live deployment smoke also pass.

Green result after implementation:

```bash
pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller image-workspaces.service image-usage
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
```

Follow-up source-level regression coverage:

```bash
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm build:frontend
```

The follow-up red test failed before the canvas hydration fix because deleted backend assets could leave stale Mira image shapes on the tldraw canvas. The green implementation removes those stale shapes during workspace image hydration; the focused frontend suite then passed 107/107.

Automated verification status: PASS.

```bash
pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm --filter @rednote/backend test -- image-assets image-workspaces.controller image-workspaces.service image-usage
pnpm build:backend
pnpm build:frontend
git diff --check
```

Results: backend targeted suites passed 54/54 in the broader run, frontend source/proxy tests passed 106/106, both builds completed, and `git diff --check` produced no output.

## Task 7A: Remove Public Storage Keys From Image APIs

**Files:**
- Modify: `packages/backend/src/image-workspaces/image-workspaces.types.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.types.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.spec.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/types.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/components/asset-version-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`
- Add: `packages/web-frontend/src/app/api/image-assets/[assetId]/versions/[versionId]/preview/route.ts`
- Add: `packages/web-frontend/src/app/api/image-assets/[assetId]/versions/[versionId]/download/route.ts`
- Modify: `packages/web-frontend/src/app/api/image-assets/proxy.test.mjs`

- [x] **Step 1: Add failing backend serializer tests**

Add assertions that serialized image versions never expose raw storage fields:

```ts
const serialized = serializeImageWorkspace(workspace);
const version = serialized.assets[0]?.versions[0];

expect(version).toEqual(
  expect.objectContaining({
    id: "version-1",
    assetId: "asset-1",
    mimeType: "image/png",
    width: 1024,
    height: 1024
  })
);
expect(version).not.toHaveProperty("storageKey");
expect(version).not.toHaveProperty("maskKey");
```

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types
```

Expected: FAIL before implementation because `storageKey` is still present.

- [x] **Step 2: Remove raw storage fields from backend public serializers**

Update the public version shape to keep user-visible metadata only:

```ts
export type PublicImageVersion = {
  id: string;
  assetId: string;
  parentId: string | null;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  prompt: string | null;
  editPrompt: string | null;
  provider: string;
  providerJob: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
```

Internal services may still use `storageKey`, but no public controller response should include it.

- [x] **Step 3: Add version-specific signed download endpoints**

Expose backend routes:

```text
GET /image-assets/:assetId/versions/:versionId/download
GET /image-assets/:assetId/download
```

Both require a user session and workspace ownership. The first downloads a selected historical version; the second keeps the existing current-version behavior.

- [x] **Step 4: Add same-origin frontend preview/download routes**

Create frontend proxy routes:

```text
GET /api/image-assets/:assetId/versions/:versionId/preview
GET /api/image-assets/:assetId/versions/:versionId/download
```

Both routes forward cookies to the backend version download endpoint. Preview redirects to the signed URL for image display; download returns or redirects to the signed URL used by the browser download action.

- [x] **Step 5: Update frontend public types and helpers**

Change `ImageVersion` in `packages/web-frontend/src/app/image-workspace/types.ts` to remove `storageKey`. Add helpers:

```ts
export function createImageAssetPreviewUrl(assetId: string): string {
  return `/api/image-assets/${encodeURIComponent(assetId)}/preview`;
}

export function createImageVersionPreviewUrl(assetId: string, versionId: string): string {
  return `/api/image-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/preview`;
}

export function createImageVersionDownloadUrl(assetId: string, versionId: string): string {
  return `/api/image-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/download`;
}
```

- [x] **Step 6: Update version panel rendering**

`AssetVersionPanel` must use `createImageVersionPreviewUrl(asset.id, version.id)` for compare thumbnails and `createImageVersionDownloadUrl(asset.id, currentVersion.id)` for downloads. It must not contain `storageKey` in rendered JSX or test-only data attributes.

- [x] **Step 7: Run targeted tests**

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types image-assets.controller image-assets.service
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
```

Expected: PASS.

## Task 8: Add Admin Configuration And Cost Controls

**Files:**
- Modify: `packages/backend/src/admin/admin.types.ts`
- Modify: `packages/backend/src/admin/runtime-secrets.service.ts`
- Modify: `packages/backend/src/admin/admin.controller.ts`
- Create: `packages/backend/src/image-workspaces/image-usage.service.ts`
- Create: `packages/backend/src/image-workspaces/image-usage.service.spec.ts`
- Modify: `packages/web-frontend/src/app/admin/*`
- Test: relevant admin frontend source tests

- [ ] **Step 1: Add backend usage tests**

Tests must prove:

- generation can be disabled globally;
- missing image provider config blocks image tasks with a safe user-facing error;
- per-user daily task quota is enforced;
- task cost metadata stores provider, model, size, quality, and estimated cost;
- admin responses mask secret values.

- [ ] **Step 2: Add admin UI tests**

Tests must prove:

- admin key management shows image provider settings on desktop and mobile;
- sensitive values are masked;
- saving image config calls existing runtime secret APIs;
- the image provider test action shows pass/fail without exposing secrets.

- [ ] **Step 3: Implement quota checks**

Before `createTask` persists a queued task, check:

- global image generation enabled;
- provider config complete;
- user quota for current UTC day;
- MIME/size limits for uploaded images and masks.

- [ ] **Step 4: Run admin and backend tests**

Run:

```bash
pnpm --filter @rednote/backend test -- admin image-usage image-workspaces
pnpm --filter @mira/web-frontend test -- admin
```

Expected: PASS.

## Task 8A: Add Provider Gating And Daily Quota Guard

**Files:**
- Create: `packages/backend/src/image-workspaces/image-usage.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-usage.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.module.ts`

- [x] **Step 1: Run the current red usage test**

Run:

```bash
pnpm --filter @rednote/backend test -- image-usage
```

Expected before implementation: FAIL because `./image-usage.service.js` does not exist yet.

- [x] **Step 2: Implement `ImageUsageService`**

Create `packages/backend/src/image-workspaces/image-usage.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  TooManyRequestsException
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

@Injectable()
export class ImageUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeSecrets: RuntimeSecretsService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async assertCanCreateTask(userId: string): Promise<void> {
    const status = await this.runtimeSecrets.getImageProviderStatus();

    if (status.provider === "disabled") {
      throw new BadRequestException("图像生成功能已关闭，请联系管理员");
    }

    if (!status.configured) {
      throw new BadRequestException("图像生成配置不完整，请联系管理员");
    }

    const config = await this.runtimeSecrets.getImageConfig();
    const dailyLimit = parsePositiveInteger(config.maxDailyTasksPerUser, 50);
    const taskCount = await this.prisma.imageTask.count({
      where: {
        userId,
        createdAt: {
          gte: startOfUtcDay(this.now())
        },
        status: {
          not: "canceled"
        }
      }
    });

    if (taskCount >= dailyLimit) {
      throw new TooManyRequestsException("今日图像任务次数已用完");
    }
  }
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}
```

- [x] **Step 3: Wire usage checks into task creation**

Update `packages/backend/src/image-workspaces/image-workspaces.service.ts`:

```ts
import { ImageUsageService } from "./image-usage.service.js";

constructor(
  private readonly prisma: PrismaService,
  @Optional()
  private readonly queue?: ImageQueueService,
  @Optional()
  private readonly worker?: ImageWorkerService,
  @Optional()
  private readonly usage?: ImageUsageService
) {}

async createTask(userId: string, workspaceId: string, request: ImageTaskRequest) {
  await this.findOwnedWorkspace(userId, workspaceId);
  await this.usage?.assertCanCreateTask(userId, { workspaceId, request });

  const task = await this.prisma.imageTask.create({
    data: {
      workspaceId,
      userId,
      type: request.type,
      input: toInputJson({
        prompt: request.prompt,
        ...(request.target ? { target: request.target } : {}),
        ...(request.assetId ? { assetId: request.assetId } : {}),
        ...(request.versionId ? { versionId: request.versionId } : {}),
        ...(request.maskKey ? { maskKey: request.maskKey } : {})
      })
    }
  });

  if (this.queue) {
    await this.queue.enqueue({
      taskId: task.id,
      workspaceId,
      userId,
      type: request.type
    });
  } else {
    void this.worker?.processTask(task.id).catch(() => undefined);
  }

  return {
    task: serializeImageTask(task)
  };
}
```

- [x] **Step 4: Register the service in the image workspace module**

Update `packages/backend/src/image-workspaces/image-workspaces.module.ts`:

```ts
import { ImageUsageService } from "./image-usage.service.js";

providers: [
  ImageWorkspacesService,
  ImageUsageService,
  ImageAssetsService,
  ImageQueueService,
  ImageWorkerService,
  LocalImageStorageService,
  OpenAIImageProviderService,
  {
    provide: IMAGE_PROVIDER,
    useExisting: OpenAIImageProviderService
  },
  {
    provide: IMAGE_STORAGE,
    useExisting: LocalImageStorageService
  }
],
exports: [
  ImageWorkspacesService,
  ImageUsageService,
  ImageAssetsService,
  ImageQueueService,
  ImageWorkerService,
  IMAGE_PROVIDER,
  IMAGE_STORAGE
]
```

- [x] **Step 5: Add service-level integration coverage**

Add a test to `packages/backend/src/image-workspaces/image-workspaces.service.spec.ts` proving usage policy runs before creating a task:

```ts
it("checks image usage policy before creating a task", async () => {
  const prisma = createPrisma([
    workspace("workspace-1", "user-1", "Canvas", "2026-06-23T08:00:00.000Z")
  ]);
  const usage = {
    assertCanCreateTask: jest.fn(() => Promise.resolve())
  };
  const service = new ImageWorkspacesService(
    prisma,
    undefined,
    undefined,
    usage as never
  );

  await service.createTask("user-1", "workspace-1", {
    type: "generate",
    prompt: "A compact Mira product image"
  });

  expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1");
});
```

Add a rejection test:

```ts
it("does not persist a task when usage policy rejects it", async () => {
  const prisma = createPrisma([
    workspace("workspace-1", "user-1", "Canvas", "2026-06-23T08:00:00.000Z")
  ]);
  const usage = {
    assertCanCreateTask: jest.fn(() =>
      Promise.reject(new Error("今日图像任务次数已用完"))
    )
  };
  const service = new ImageWorkspacesService(
    prisma,
    undefined,
    undefined,
    usage as never
  );

  await expect(
    service.createTask("user-1", "workspace-1", {
      type: "generate",
      prompt: "A compact Mira product image"
    })
  ).rejects.toThrow("今日图像任务次数已用完");

  expect(prisma.imageTask.create).not.toHaveBeenCalled();
});
```

- [x] **Step 6: Verify the quota slice**

Run:

```bash
pnpm --filter @rednote/backend test -- image-usage image-workspaces.service
pnpm --filter @rednote/backend test -- image-worker image-workspaces.service image-usage
pnpm build:backend
```

Expected: PASS.

## Task 8B: Add Admin Image Usage UI

**Files:**
- Create: `packages/web-frontend/src/app/api/admin/image-usage/route.ts`
- Create: `packages/web-frontend/src/app/admin/admin-image-usage-panel.tsx`
- Modify: `packages/web-frontend/src/app/admin/admin-types.ts`
- Modify: `packages/web-frontend/src/app/admin/admin-api.ts`
- Modify: `packages/web-frontend/src/app/admin/admin-navigation.tsx`
- Modify: `packages/web-frontend/src/app/admin/admin-overview-panel.tsx`
- Modify: `packages/web-frontend/src/app/admin/admin-shell.tsx`
- Test: `packages/web-frontend/src/app/admin/admin-copy.test.mjs`
- Test: `packages/web-frontend/src/app/api/admin/proxy.test.mjs`

- [x] **Step 1: Run the current red admin frontend tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- admin-copy proxy.test
```

Expected before implementation: FAIL because:

- `packages/web-frontend/src/app/admin/admin-image-usage-panel.tsx` does not exist.
- `packages/web-frontend/src/app/api/admin/image-usage/route.ts` does not exist.
- `admin-api.ts` does not export `loadAdminImageUsage`.
- `AdminShell` does not import or render `AdminImageUsagePanel`.
- `admin-navigation.tsx` does not include `图像用量`.
- `admin-overview-panel.tsx` does not include `打开图像用量`.

- [x] **Step 2: Add the same-origin admin proxy route**

Create `packages/web-frontend/src/app/api/admin/image-usage/route.ts`:

```ts
import { proxyAdminRequest } from "../proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyAdminRequest(request, "image-usage");
}
```

- [x] **Step 3: Add image usage response types**

Append these types to `packages/web-frontend/src/app/admin/admin-types.ts`:

```ts
export type AdminImageUsageStatusCounts = {
  canceled: number;
  complete: number;
  failed: number;
  queued: number;
  running: number;
};

export type AdminImageUsageProvider = {
  provider: string;
  taskCount: number;
  estimatedCostUsd: number;
};

export type AdminImageUsageType = {
  type: string;
  taskCount: number;
  estimatedCostUsd: number;
};

export type AdminImageUsageResponse = {
  activeUsers: number;
  byProvider: AdminImageUsageProvider[];
  byType: AdminImageUsageType[];
  estimatedCostUsd: number;
  statusCounts: AdminImageUsageStatusCounts;
  totalTasks: number;
  windowDays: number;
};
```

- [x] **Step 4: Add the admin API loader**

Update the type import in `packages/web-frontend/src/app/admin/admin-api.ts`:

```ts
import type {
  AdminImageUsageResponse,
  AdminSession,
  AdminUser,
  AdminUsersResponse,
  AdminUserStatus,
  ManagedSecret,
} from "./admin-types";
```

Append the loader:

```ts
export async function loadAdminImageUsage() {
  const response = await fetch("/api/admin/image-usage");
  await assertOk(response, "图像用量加载失败");
  return readJson<AdminImageUsageResponse>(response);
}
```

- [x] **Step 5: Wire the admin module navigation**

Update `packages/web-frontend/src/app/admin/admin-navigation.tsx`.

Add the icon import:

```ts
import {
  ChartNoAxesColumnIncreasing,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
```

Extend the section union:

```ts
export type AdminSection =
  | "overview"
  | "users"
  | "imageUsage"
  | "secrets"
  | "security";
```

Insert this item after account management:

```ts
{
  id: "imageUsage",
  label: "图像用量",
  title: "图像用量",
  description: "查看图像任务、成本和失败状态。",
  icon: ChartNoAxesColumnIncreasing,
},
```

Update `packages/web-frontend/src/app/admin/admin-shell.tsx`.

Add the import:

```ts
import { AdminImageUsagePanel } from "./admin-image-usage-panel";
```

Add the active section branch before `secrets`:

```tsx
if (activeSection === "imageUsage") {
  return <AdminImageUsagePanel showHeader={false} />;
}
```

Update `packages/web-frontend/src/app/admin/admin-overview-panel.tsx`.

Add the icon import:

```ts
import {
  ChartNoAxesColumnIncreasing,
  KeyRound,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
```

Change the quick action grid to four columns on medium screens:

```tsx
<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
```

Insert this quick action after account management:

```tsx
<QuickAction
  description="查看图像任务、成本和失败状态。"
  icon={ChartNoAxesColumnIncreasing}
  label="打开图像用量"
  onClick={() => onSelectSection("imageUsage")}
/>
```

- [x] **Step 6: Create the usage panel**

Create `packages/web-frontend/src/app/admin/admin-image-usage-panel.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadAdminImageUsage } from "./admin-api";
import type {
  AdminImageUsageProvider,
  AdminImageUsageResponse,
  AdminImageUsageType,
} from "./admin-types";

const statusLabels: Record<
  keyof AdminImageUsageResponse["statusCounts"],
  string
> = {
  canceled: "已取消",
  complete: "已完成",
  failed: "失败",
  queued: "排队中",
  running: "运行中",
};

export function AdminImageUsagePanel({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const [usage, setUsage] = useState<AdminImageUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function refreshUsage() {
    setLoading(true);
    setMessage("");

    try {
      setUsage(await loadAdminImageUsage());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图像用量加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshUsage();
  }, []);

  const failedTaskCount = usage?.statusCounts.failed ?? 0;
  const runningTaskCount = useMemo(() => {
    if (!usage) return 0;
    return usage.statusCounts.queued + usage.statusCounts.running;
  }, [usage]);

  return (
    <div className="grid gap-4">
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-[760]">图像用量</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">
              查看最近图像任务、成本估算和失败状态。
            </p>
          </div>
          <RefreshButton loading={loading} onClick={() => void refreshUsage()} />
        </div>
      ) : (
        <div className="flex justify-end">
          <RefreshButton loading={loading} onClick={() => void refreshUsage()} />
        </div>
      )}

      {message ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <UsageTile
          label={`${usage?.windowDays ?? 30} 天任务`}
          loading={loading}
          value={usage ? String(usage.totalTasks) : "--"}
        />
        <UsageTile
          label="估算成本"
          loading={loading}
          value={usage ? formatUsd(usage.estimatedCostUsd) : "--"}
        />
        <UsageTile
          label="活跃用户"
          loading={loading}
          value={usage ? String(usage.activeUsers) : "--"}
        />
        <UsageTile
          label="运行/失败"
          loading={loading}
          value={usage ? `${runningTaskCount} / ${failedTaskCount}` : "--"}
        />
      </div>

      <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-sm font-[720]">任务状态</div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {(
            Object.entries(statusLabels) as Array<
              [keyof AdminImageUsageResponse["statusCounts"], string]
            >
          ).map(([status, label]) => (
            <div
              className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-3"
              key={status}
            >
              <div className="text-xs text-[var(--muted-strong)]">{label}</div>
              <div className="mt-2 text-lg leading-tight font-[760]">
                {usage?.statusCounts[status] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          emptyLabel="暂无 provider 用量"
          rows={usage?.byProvider ?? []}
          title="Provider"
          valueKey="provider"
        />
        <BreakdownTable
          emptyLabel="暂无类型用量"
          rows={usage?.byType ?? []}
          title="任务类型"
          valueKey="type"
        />
      </div>
    </div>
  );
}

function RefreshButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60 md:h-9"
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      <RefreshCw aria-hidden="true" size={15} />
      {loading ? "刷新中" : "刷新"}
    </button>
  );
}

function UsageTile({
  label,
  loading,
  value,
}: {
  label: string;
  loading: boolean;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs font-[650] text-[var(--muted-strong)]">
        {label}
      </div>
      <div className="mt-3 truncate text-xl leading-tight font-[760]">
        {loading ? "--" : value}
      </div>
    </div>
  );
}

function BreakdownTable({
  emptyLabel,
  rows,
  title,
  valueKey,
}: {
  emptyLabel: string;
  rows: Array<AdminImageUsageProvider | AdminImageUsageType>;
  title: string;
  valueKey: "provider" | "type";
}) {
  return (
    <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-sm font-[720]">{title}</div>
      <div className="mt-3 overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[360px] text-left text-xs">
            <thead className="text-[var(--muted-strong)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-[650]">{title}</th>
                <th className="py-2 pr-3 font-[650]">任务数</th>
                <th className="py-2 font-[650]">估算成本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowName =
                  valueKey === "provider"
                    ? (row as AdminImageUsageProvider).provider
                    : (row as AdminImageUsageType).type;

                return (
                  <tr
                    className="border-b border-[var(--border)] last:border-b-0"
                    key={`${valueKey}-${rowName}`}
                  >
                    <td className="max-w-[180px] truncate py-2 pr-3 font-[650]">
                      {rowName}
                    </td>
                    <td className="py-2 pr-3 text-[var(--muted-strong)]">
                      {row.taskCount}
                    </td>
                    <td className="py-2 text-[var(--muted-strong)]">
                      {formatUsd(row.estimatedCostUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-4 text-xs text-[var(--muted-strong)]">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}

function formatUsd(value: number) {
  return `$${value.toFixed(3)}`;
}
```

- [x] **Step 7: Verify source-contract tests and frontend build**

Run:

```bash
pnpm --filter @mira/web-frontend test -- admin-copy proxy.test
pnpm build:frontend
```

Expected: PASS.

- [x] **Step 8: Browser QA the admin usage page**

Open the local admin page at `http://127.0.0.1:3011/admin#imageUsage` or the active frontend dev server URL.

Verify:

- desktop sidebar item `图像用量` aligns with the other admin modules;
- mobile module scroller includes `图像用量`;
- the refresh button is `h-11` on mobile and `md:h-9` on wider screens;
- usage tiles, status counts, provider table, and task-type table do not overlap at desktop or mobile widths;
- loading and error states are readable;
- no default input outline style is introduced;
- no raw provider secret or raw tool payload is shown.

Verification completed with a temporary mock admin backend:

```bash
pnpm --filter @mira/web-frontend test -- admin-copy proxy.test
pnpm build:frontend
```

Browser QA:

```text
Target: http://127.0.0.1:3011/admin#imageUsage
Backend mock: http://127.0.0.1:3012
Desktop: sidebar shows 图像用量, the section renders task totals, estimated cost, active users, status counts, provider breakdown, and type breakdown.
Mobile 390x844: the top module scroller shows 图像用量, refresh remains visible, and the usage cards/status/table content render without missing controls.
Note: the in-app browser screenshot command timed out twice, so QA evidence is DOM/visible-node based rather than screenshot-based.
```

## Task 9: Production Deployment Shape

**Files:**
- Modify: `docker-compose.yml` or deployment template used by GitHub Actions
- Modify: `.github/workflows/*`
- Modify: `packages/backend/Dockerfile`
- Modify: `packages/web-frontend/Dockerfile`
- Create or modify: deployment docs under `docs/`

- [x] **Step 1: Keep API and worker topology explicit**

Use one of these service shapes:

```text
backend: HTTP API, auth, admin, image API, progress stream
worker: same backend image, command runs image worker loop
postgres: metadata
redis: sessions, queues, progress
caddy: HTTP/HTTPS reverse proxy
```

For low traffic, `backend` may run the worker in-process. Keep the docker-compose service boundary ready so it can split without code rewrites.

Implemented status:

- `packages/backend/src/image-worker-runner.ts` starts a Nest application context and loops on `ImageWorkerService.processNext()`.
- `ImageQueueService` explicitly injects `RedisService`, so queued image tasks are visible to the separate worker container.
- `docker-compose.yml` defines `backend` for HTTP/migrations and `worker` for the image worker loop, both using the same backend image.
- `.github/workflows/deploy.yml` writes the same worker service into the remote compose file and starts `backend worker frontend caddy`.
- `.github/CICD.md` documents that worker reuses `rednote_backend` and does not rerun migrations.

- [ ] **Step 2: Verify images build and push**

Run locally before relying on GitHub Actions:

```bash
pnpm build:backend
pnpm build:frontend
docker compose build backend frontend
```

Expected: TypeScript builds and Docker builds pass.

Current status: `pnpm build:backend` passes and `dist/image-worker-runner.js` is emitted. Docker CLI is not installed in the current local environment, so `docker compose build backend frontend` and `docker compose config --quiet` still need to run on a machine with Docker available.

- [ ] **Step 3: Verify deploy speed constraints**

Use Alibaba Cloud ACR for Mira application images. Keep public base images mirrored or pre-pulled on the server so deploys do not wait on Docker Hub.

- [x] **Step 4: Add post-deploy smoke checks**

Use deploy smoke checks that prove the new containers are reachable after Caddy reload without depending on a real end-user account. The current image workspace is client auth-gated; anonymous users see the email login panel instead of receiving a server-side redirect. The smoke check must therefore assert that `/image-workspace` loads the Mira login/workspace shell, not that it returns a `302`.

Write the failing topology test first in `packages/backend/src/config/deployment-topology.spec.ts`:

```ts
it("runs smoke checks after Caddy reload and before image cleanup", () => {
  const workflow = readRepositoryFile(".github/workflows/deploy.yml");
  const reloadIndex = workflow.indexOf("docker compose exec -T caddy caddy reload");
  const smokeIndex = workflow.indexOf("run_smoke_checks");
  const pruneIndex = workflow.indexOf("docker image prune -f");

  expect(smokeIndex).toBeGreaterThan(reloadIndex);
  expect(pruneIndex).toBeGreaterThan(smokeIndex);
  expect(workflow).toContain("docker compose exec -T backend node -e");
  expect(workflow).toContain("http://localhost:3000/health");
  expect(workflow).toContain("https://${{ secrets.APP_DOMAIN }}/admin");
  expect(workflow).toContain("https://${{ secrets.APP_DOMAIN }}/image-workspace");
  expect(workflow).toContain("grep -E \"(Mira|管理员|登录|邮箱|图像)\"");
});
```

Run:

```bash
pnpm --filter @rednote/backend test -- deployment-topology
```

Expected before implementation: FAIL because the workflow does not define or call `run_smoke_checks`.

Then add this function to `.github/workflows/deploy.yml` immediately after the Caddy reload command and before image pruning:

```bash
run_smoke_checks() {
  echo "Checking backend health inside the backend container..."
  docker compose exec -T backend node -e '
    const http = require("http");
    const request = http.get("http://localhost:3000/health", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          console.error(body);
          process.exit(1);
        }
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          console.error(body);
          process.exit(1);
        }
        if (payload.status !== "ok" && payload.status !== "degraded") {
          console.error(body);
          process.exit(1);
        }
      });
    });
    request.setTimeout(5000, () => {
      request.destroy(new Error("health timeout"));
    });
    request.on("error", (error) => {
      console.error(error.message);
      process.exit(1);
    });
  '

  echo "Checking public admin page..."
  curl --fail --silent --show-error --location --max-time 20 "https://${{ secrets.APP_DOMAIN }}/admin" \
    | grep -E "(Mira|管理员|登录|邮箱|图像)" >/dev/null

  echo "Checking public image workspace login gate..."
  curl --fail --silent --show-error --location --max-time 20 "https://${{ secrets.APP_DOMAIN }}/image-workspace" \
    | grep -E "(Mira|管理员|登录|邮箱|图像)" >/dev/null
}

echo "Running post-deploy smoke checks..."
run_smoke_checks
```

Run:

```bash
pnpm --filter @rednote/backend test -- deployment-topology
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "workflow yaml ok"'
```

Expected after implementation: PASS.

Current status: implemented in `.github/workflows/deploy.yml` after Caddy reload and before `docker image prune -f`. The topology test was first observed red because `run_smoke_checks` was missing, then passed after implementation.

Authenticated image task creation should stay as a manual or later optional smoke until the project has a stable non-human smoke account/session flow. The manual command after logging in through the browser is:

```bash
APP_DOMAIN="${APP_DOMAIN:?APP_DOMAIN is required}"
WORKSPACE_ID="${WORKSPACE_ID:?WORKSPACE_ID is required}"
AUTH_COOKIE="${AUTH_COOKIE:?AUTH_COOKIE is required}"

curl --fail --silent --show-error \
  -X POST "https://${APP_DOMAIN}/api/image-workspaces/${WORKSPACE_ID}/tasks" \
  -H "content-type: application/json" \
  -H "cookie: ${AUTH_COOKIE}" \
  --data '{"type":"generate","prompt":"Mira deployment smoke image","size":"1024x1024","quality":"low"}'
```

Expected: either a queued task response or a safe user-facing configuration/quota error. The response must not include provider secrets, raw storage keys, raw mask keys, or raw provider payloads.

## Task 9A: Prevent Duplicate Task Execution In Split Worker Mode

**Files:**
- Modify: `packages/backend/src/image-workspaces/image-workspaces.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Test: `packages/backend/src/image-workspaces/image-workspaces.service.spec.ts`
- Test: `packages/backend/src/image-workspaces/image-assets.service.spec.ts`

The current service code enqueues image tasks and then immediately calls `worker.processTask(task.id)` from the API process. That was convenient before the dedicated worker container existed, but the production topology now runs `worker` as a separate process consuming the same Redis queue. When both paths are active, a generated/edit/variation task can be processed twice. Fix this before production landing.

- [x] **Step 1: Write the failing workspace task test**

Change the existing `ImageWorkspacesService` test named `"starts in-process task execution after queuing a generated image task"` to assert queue-only behavior when `ImageQueueService` is present.

Use this expectation:

```ts
it("enqueues generated image tasks without processing them inline when a queue is present", async () => {
  const prisma = createPrisma([
    workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z")
  ]);
  const queue = {
    enqueue: jest.fn(() => Promise.resolve())
  };
  const worker = {
    processTask: jest.fn(() => Promise.resolve())
  };
  const service = new ImageWorkspacesService(prisma, queue, worker);

  await service.createTask("user-1", "workspace-1", {
    type: "generate",
    prompt: "make a cover"
  });

  expect(queue.enqueue).toHaveBeenCalledWith({
    taskId: "task-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "generate"
  });
  expect(worker.processTask).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Write the failing asset edit/variation task tests**

In `packages/backend/src/image-workspaces/image-assets.service.spec.ts`, rename the existing edit test from `"creates a queued edit task and starts execution for the current asset version"` to queue-only wording. The red test can temporarily keep a `worker` mock and assert it is not called. After implementation removes the `ImageWorkerService` dependency from `ImageAssetsService`, keep the final test focused on the queued task response and `queue.enqueue` payload.

Add a dedicated variation test:

```ts
it("enqueues variation tasks without processing them inline when a queue is present", async () => {
  const queue = createQueue();
  const service = new ImageAssetsService(
    createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
    queue,
    createStorage()
  );

  await expect(service.createVariationTask("user-1", "asset-1")).resolves.toEqual({
    task: expect.objectContaining({
      id: "task-1",
      type: "variation",
      status: "queued",
      input: {
        prompt: "source prompt",
        assetId: "asset-1",
        versionId: "version-1"
      }
    })
  });
  expect(queue.enqueue).toHaveBeenCalledWith({
    taskId: "task-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "variation"
  });
});
```

- [x] **Step 3: Run the red tests**

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service image-assets
```

Expected before implementation: FAIL because `worker.processTask` is still called by `createTask`, `createEditTask`, and `createVariationTask`.

- [x] **Step 4: Remove inline processing from API services**

In `packages/backend/src/image-workspaces/image-workspaces.service.ts`, remove the unconditional inline worker call from `createTask`:

```ts
void this.worker?.processTask(task.id).catch(() => undefined);
```

Actual implementation: `ImageWorkspacesService` keeps the optional `ImageWorkerService` fallback only for no-queue construction. When `ImageQueueService` is injected, `createTask` only enqueues and never calls `worker.processTask`.

In `packages/backend/src/image-workspaces/image-assets.service.ts`, remove these lines from `createEditTask` and `createVariationTask`:

```ts
void this.worker.processTask(task.id).catch(() => undefined);
```

Actual implementation: `ImageAssetsService` removed the `ImageWorkerService` constructor dependency and import. Asset edit and variation task creation now persists the task, enqueues it, and returns the queued public task response.

Production task execution should flow through:

```text
API service creates ImageTask -> ImageQueueService.enqueue -> worker service processNext/processTask
```

- [x] **Step 5: Verify worker-owned execution still works**

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.service image-assets image-worker image-queue
pnpm build:backend
```

Expected after implementation: PASS. The service tests prove the API process only persists and enqueues tasks. The worker tests prove the separate worker can still claim queued tasks and process them.

Current status: implemented and verified. The red test run failed on the three expected inline `processTask` calls, then the green verification passed with 36 targeted backend tests and `pnpm build:backend`.

## Task 9B: Add Safe Image Task Cancellation

**Files:**
- Modify: `packages/backend/src/image-workspaces/image-queue.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-queue.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.service.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.controller.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-worker.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-worker.service.spec.ts`
- Add: `packages/web-frontend/src/app/api/image-workspaces/[id]/tasks/[taskId]/cancel/route.ts`
- Modify: `packages/web-frontend/src/app/api/image-workspaces/proxy.test.mjs`
- Modify: `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/page.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/components/inspector-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/components/task-inspector.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

Goal: users can cancel queued or running image tasks from the task inspector. The UI should show a small icon-only cancel button for cancelable tasks, the backend must remove pending queue entries, and worker completion must not overwrite a task that was canceled while provider work was already running.

Current status: implemented and automated verification is green. Red tests first failed for post-provider worker cancellation and frontend cancel wiring, then the backend worker guard, frontend hook/shell/task inspector wiring, targeted test suites, backend build, frontend build, and `git diff --check` passed. Browser visual QA now passes against `http://127.0.0.1:3011/image-workspace` using a production Next preview and mock backend: canceling a queued task updates it to `canceled`, removes the cancel control, and keeps raw provider/tool/storage details hidden.

- [x] **Step 1: Write backend red tests for queue, service, controller, and worker pre-claim cancellation**

Add queue coverage in `packages/backend/src/image-workspaces/image-queue.service.spec.ts`:

```ts
it("removes canceled tasks from the pending queue", async () => {
  const redis = createRedis();
  const queue = new ImageQueueService(redis);

  await queue.enqueue({
    taskId: "task-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "generate"
  });
  await queue.enqueue({
    taskId: "task-2",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "generate"
  });

  await queue.remove("task-1");

  await expect(queue.claimNext()).resolves.toEqual({
    taskId: "task-2",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "generate"
  });
});
```

Add service coverage in `packages/backend/src/image-workspaces/image-workspaces.service.spec.ts`:

```ts
it("cancels an owned queued task and publishes a safe canceled event", async () => {
  const prisma = createPrisma([
    workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z"),
    imageTask("task-1", "workspace-1", "user-1", "queued")
  ]);
  const queue = {
    remove: jest.fn(() => Promise.resolve()),
    emitEvent: jest.fn(() => Promise.resolve())
  };
  const service = new ImageWorkspacesService(prisma, queue as never);

  await expect(
    service.cancelTask("user-1", "workspace-1", "task-1")
  ).resolves.toEqual({
    task: expect.objectContaining({
      id: "task-1",
      status: "canceled",
      error: null
    })
  });

  expect(queue.remove).toHaveBeenCalledWith("task-1");
  expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
    type: "task-progress",
    taskId: "task-1",
    status: "canceled",
    message: "任务已取消"
  });
});

it("does not cancel completed tasks", async () => {
  const prisma = createPrisma([
    workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z"),
    imageTask("task-1", "workspace-1", "user-1", "complete")
  ]);
  const service = new ImageWorkspacesService(prisma);

  await expect(
    service.cancelTask("user-1", "workspace-1", "task-1")
  ).rejects.toThrow("Image task not found.");
});
```

Add controller coverage in `packages/backend/src/image-workspaces/image-workspaces.controller.spec.ts`:

```ts
it("cancels image tasks for the authenticated workspace owner", async () => {
  service.cancelTask.mockResolvedValue({
    task: {
      id: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate",
      status: "canceled"
    }
  });

  await controller.cancelTask(
    requestWithUser("user-1"),
    "workspace-1",
    "task-1"
  );

  expect(service.cancelTask).toHaveBeenCalledWith(
    "user-1",
    "workspace-1",
    "task-1"
  );
});
```

Add worker pre-claim coverage in `packages/backend/src/image-workspaces/image-worker.service.spec.ts`:

```ts
it("skips tasks that were canceled before the worker claimed them", async () => {
  const { worker, provider, prisma } = createWorker({
    tasks: [imageTask("task-1", "workspace-1", "user-1", "canceled")]
  });

  await worker.processTask("task-1");

  expect(provider.generate).not.toHaveBeenCalled();
  expect(prisma.imageTask.update).not.toHaveBeenCalled();
});
```

Run:

```bash
pnpm --filter @rednote/backend test -- image-queue image-workspaces.service image-workspaces.controller image-worker
```

Expected before implementation: FAIL because `ImageQueueService.remove`, `ImageWorkspacesService.cancelTask`, `ImageWorkspacesController.cancelTask`, and the worker canceled-task guard do not exist or are incomplete.

- [x] **Step 2: Implement backend cancellation route and queue removal**

Add `remove()` to `packages/backend/src/image-workspaces/image-queue.service.ts`:

```ts
async remove(taskId: string): Promise<void> {
  const queue = await this.readQueue();
  await this.writeQueue(queue.filter((payload) => payload.taskId !== taskId));
}
```

Add `cancelTask()` to `packages/backend/src/image-workspaces/image-workspaces.service.ts`:

```ts
async cancelTask(userId: string, workspaceId: string, taskId: string) {
  await this.findOwnedWorkspace(userId, workspaceId);

  const result = await this.prisma.imageTask.updateMany({
    where: {
      id: taskId,
      workspaceId,
      userId,
      status: {
        in: ["queued", "running"]
      }
    },
    data: {
      status: "canceled",
      error: null,
      finishedAt: new Date()
    }
  });

  if (result.count === 0) throw new NotFoundException("Image task not found.");

  await this.queue?.remove(taskId);
  await this.queue?.emitEvent(taskId, {
    type: "task-progress",
    taskId,
    status: "canceled",
    message: "任务已取消"
  });

  const task = await this.prisma.imageTask.findFirst({
    where: {
      id: taskId,
      workspaceId,
      userId
    }
  });

  if (!task) throw new NotFoundException("Image task not found.");
  return {
    task: serializeImageTask(task)
  };
}
```

Add the controller route in `packages/backend/src/image-workspaces/image-workspaces.controller.ts`:

```ts
@Post(":id/tasks/:taskId/cancel")
async cancelTask(
  @Req() request: Request,
  @Param("id") id: string,
  @Param("taskId") taskId: string
) {
  const user = await this.requireUser(request);
  return this.workspaces.cancelTask(user.id, id, taskId);
}
```

Keep the worker pre-claim guard in `packages/backend/src/image-workspaces/image-worker.service.ts`:

```ts
if (!task) return;
if (task.status === "canceled") return;
```

- [x] **Step 3: Add worker post-provider cancellation hardening**

The current pre-claim guard protects queued tasks that are canceled before the worker starts. It does not protect running tasks canceled while the provider request is still in flight. Add a second guard before creating or updating durable assets.

Add a helper in `packages/backend/src/image-workspaces/image-worker.service.ts`:

```ts
private async isTaskCanceled(taskId: string): Promise<boolean> {
  const task = await this.prisma.imageTask.findUnique({
    where: { id: taskId },
    select: { status: true }
  });
  return task?.status === "canceled";
}
```

Call the helper immediately after each provider call and before `storage.putImage()`:

```ts
const generated = await this.provider.generate({
  prompt: input.prompt,
  size: input.size,
  quality: input.quality,
  background: input.background
});
if (await this.isTaskCanceled(task.id)) return;
```

Use the same pattern in `processImageEditTask()` after `this.provider.edit(...)` and before storing the returned bytes.

Continuation hardening: also re-check cancellation immediately after each `storage.putImage()` call. If the task was canceled after provider work but before durable database writes, call `storage.deleteImage(stored)` as a best-effort cleanup and return without creating an `ImageAsset`, `ImageVersion`, `CanvasObject`, or complete task update.

Add worker test coverage:

```ts
it("does not create assets when a running task is canceled during provider work", async () => {
  const { worker, provider, prisma, storage } = createWorker({
    tasks: [imageTask("task-1", "workspace-1", "user-1", "running")]
  });
  provider.generate.mockImplementation(async () => {
    prisma.imageTask.findUnique.mockResolvedValueOnce({
      id: "task-1",
      status: "canceled"
    });
    return generatedImage();
  });

  await worker.processTask("task-1");

  expect(storage.putImage).not.toHaveBeenCalled();
  expect(prisma.imageAsset.create).not.toHaveBeenCalled();
});
```

Run:

```bash
pnpm --filter @rednote/backend test -- image-worker
```

Expected: PASS, and a canceled running task remains canceled instead of becoming complete after provider response.

Additional red/green result: `does not create generated assets when a task is canceled after storage writes` and `does not create edited versions when a task is canceled after storage writes` first failed because `storage.deleteImage()` was never called after a post-storage cancellation. After adding `cleanupStoredImageIfCanceled()`, `pnpm --filter @rednote/backend test -- image-worker.service image-worker-edit` passed 11/11.

- [x] **Step 4: Add frontend proxy route and API helper**

Create `packages/web-frontend/src/app/api/image-workspaces/[id]/tasks/[taskId]/cancel/route.ts`:

```ts
import { proxyBackendRequest } from "../../../../../shared/backend-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;
  return proxyBackendRequest(
    request,
    `/image-workspaces/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/cancel`,
    { method: "POST" }
  );
}
```

Add `cancelImageTask()` to `packages/web-frontend/src/app/image-workspace/workspace-api.ts`:

```ts
export async function cancelImageTask(
  workspaceId: string,
  taskId: string
): Promise<ImageTask> {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/cancel`,
    {
      method: "POST"
    }
  );
  const payload = await readJson(response);
  return payload.task as ImageTask;
}
```

Extend `packages/web-frontend/src/app/api/image-workspaces/proxy.test.mjs` so the route is tracked:

```js
assertRouteExists(
  "src/app/api/image-workspaces/[id]/tasks/[taskId]/cancel/route.ts"
);
```

- [x] **Step 5: Wire cancellation through the image workspace hook and shell**

Import `cancelImageTask` in `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts` and add:

```ts
async function cancelTask(taskId: string) {
  if (!activeWorkspace) return;
  setError(null);
  try {
    const task = await cancelImageTask(activeWorkspace.id, taskId);
    setWorkspaces((current) =>
      updateWorkspaceTask(current, taskId, () => task)
    );
    setStreamTaskId((current) => (current === taskId ? null : current));
  } catch (cancelError) {
    setError(cancelError instanceof Error ? cancelError.message : "图像任务取消失败");
  }
}
```

Return `cancelTask` from the hook and pass it through:

```tsx
<ImageWorkspaceShell
  ...
  onCancelTask={workspace.cancelTask}
/>
```

Add `onCancelTask` props to:

- `packages/web-frontend/src/app/image-workspace/page.tsx`
- `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- `packages/web-frontend/src/app/image-workspace/components/inspector-panel.tsx`

Forward the callback into:

```tsx
<TaskInspector
  onCancelTask={onCancelTask}
  tasks={activeWorkspace?.tasks ?? []}
/>
```

- [x] **Step 6: Add the cancel control to the task inspector**

Update `packages/web-frontend/src/app/image-workspace/components/task-inspector.tsx`:

```tsx
import { XCircle } from "lucide-react";
import type { ImageTask } from "../types";

export function TaskInspector({
  onCancelTask,
  tasks
}: {
  onCancelTask: (taskId: string) => Promise<void> | void;
  tasks: ImageTask[];
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-2 text-sm font-[700]">任务</div>
      {tasks.length ? (
        <div className="space-y-2">
          {tasks.map((task) => {
            const cancelable =
              task.status === "queued" || task.status === "running";
            return (
              <div
                className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3"
                key={task.id}
              >
                <div className="flex items-center justify-between gap-3 text-sm font-[650]">
                  <span>{task.type}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-1 text-xs text-[var(--accent-strong)]">
                      {task.status}
                    </span>
                    {cancelable ? (
                      <button
                        aria-label="取消任务"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                        onClick={() => onCancelTask(task.id)}
                        title="取消任务"
                        type="button"
                      >
                        <XCircle aria-hidden="true" size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--muted-strong)]">
                  {typeof task.input.prompt === "string" ? task.input.prompt : "图像任务"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-xs leading-relaxed text-[var(--muted-strong)]">
          暂无任务。输入提示词后，Mira 会先创建可追踪任务，后续接入图像生成。
        </div>
      )}
    </div>
  );
}
```

Design constraints:

- Use the existing compact tool UI.
- Use an icon button instead of a text button.
- Keep the 8px radius already used by the app.
- Show the button only for `queued` and `running` tasks.
- Do not render provider payloads, raw tool results, raw storage keys, or raw mask keys.

- [ ] **Step 7: Verify cancellation end to end**

Run targeted tests:

```bash
pnpm --filter @rednote/backend test -- image-queue image-workspaces.service image-workspaces.controller image-worker
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
```

Expected: PASS.

Run broader verification:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm build:backend
pnpm build:frontend
git diff --check
```

Expected: PASS.

Browser verify:

- Queued/running tasks show an icon-only cancel control in the task inspector.
- Clicking cancel changes the task status to `canceled` without showing raw tool/provider data.
- If a canceled task was still queued, the worker does not process it later.
- If a canceled task was already running, it does not overwrite the canceled state with `complete` after the provider returns.
- Desktop and mobile inspector layouts stay aligned and scrollable.

Automated verification status: PASS.

```bash
pnpm --filter @rednote/backend test -- image-worker
pnpm --filter @mira/web-frontend test -- image-workspace
pnpm --filter @rednote/backend test -- image-queue image-workspaces.service image-workspaces.controller image-worker
pnpm --filter @mira/web-frontend test -- image-workspace proxy.test
pnpm --filter @rednote/backend test -- image-workspaces.types image-workspaces.service image-workspaces.controller image-usage image-assets image-worker image-queue
pnpm build:backend
pnpm build:frontend
git diff --check
```

Browser verification status: PASS against the production preview target. `http://127.0.0.1:3011/image-workspace` rendered the workspace, prompt panel, tldraw canvas, and queued task inspector with a mock backend at `http://127.0.0.1:3001`; canceling the queued task changed it to `canceled`, removed the cancel control, and did not expose raw tool/provider/storage data. The older `http://127.0.0.1:3000` dev server still appeared stale and should be cleanly restarted before it is used for future browser QA.

## Task 10: Final Verification And Landing

**Files:**
- All files touched by the implemented slice.

- [ ] **Step 1: Run full backend verification**

Run:

```bash
pnpm test:backend
pnpm build:backend
```

Expected: PASS.

- [ ] **Step 2: Run full frontend verification**

Run:

```bash
pnpm test:frontend
pnpm build:frontend
```

Expected: PASS.

- [ ] **Step 3: Run browser QA**

Open `http://localhost:3000/image-workspace` and verify:

- desktop layout columns align;
- mobile drawers expose workspace and generation controls;
- inputs have no default outline styling;
- markdown/chat areas still keep tool calls hidden;
- generated image path works if provider config exists;
- missing provider config renders a red, user-readable error below the prompt/task area.

- [ ] **Step 4: Commit only after green verification**

Commit foundation separately from provider/storage and edit/version work:

```bash
git add docs/superpowers/specs/2026-06-23-mira-image-agent-canvas-design.md docs/superpowers/plans/2026-06-23-mira-image-agent-canvas.md
git commit -m "docs: plan mira image agent canvas"
```

For implementation commits, use narrower messages such as:

```bash
git commit -m "feat: add image workspace foundation"
git commit -m "feat: add image generation provider"
git commit -m "feat: add image asset editing"
```

## Self-Review

- Spec coverage: the plan maps the design document to workspace CRUD, canvas persistence, provider calls, object storage, queue/progress, local edits, versions, admin config, quotas, deployment, and browser QA.
- Placeholder scan: no task relies on unspecified files; every phase names concrete files, routes, commands, and expected verification outcomes.
- Type consistency: frontend `CanvasSnapshot`, backend task types, provider contracts, storage refs, and stream events use the same names across tasks.
- Current risk: the next implementation pass should prioritize real provider/storage smoke checks, Docker compose validation, live deployment canary coverage, and browser QA with a completing task stream before production landing. Canvas snapshot persistence is now implemented and verified against a mock backend, but real provider/storage smoke remains the stronger end-to-end gate.

Plan complete and saved to `docs/superpowers/plans/2026-06-23-mira-image-agent-canvas.md`.
