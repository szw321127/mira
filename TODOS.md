# TODOs

## Future Iteration: Xiaohongshu Connector Platform

Status: Deferred
Priority: P2
Source: gstack `/office-hours` decision on 2026-06-15

Build Approach C from `docs/gstack/2026-06-15-xhs-research-driven-outlines-design.md`
as a separate platformization track after the research-backed outline pipeline
proves useful.

Why:

- The first implementation should focus on the creator's core loop: idea to
  research-backed outlines to publishable content.
- A full connector platform has a different risk profile: account security,
  Cookie handling, Xiaohongshu private protocol drift, rate limits, compliance,
  and ongoing operations.
- Keeping this separate prevents the first research feature from becoming a
  crawling/operations project.

Initial scope to revisit:

- Add standalone `packages/xhs-connector` service.
- Support internal API key authentication.
- Support PC Cookie import and validation.
- Encrypt stored Cookies and redact them from logs/responses.
- Track account status: active, expired, invalid.
- Add adapter layer around Spider_XHS.
- Implement search notes, import note, import account, comments, and user notes.
- Add rate limiting, retry, timeout, and explicit 429/frequency-control handling.
- Add task records for crawl/search/import jobs.
- Add optional content library and media cache.
- Surface connector health in admin content provider configuration.

Depends on:

- Approach B research-backed outline pipeline exists and proves product value.
- Compliance boundary and acceptable Xiaohongshu data-use policy are clarified.
- Connector runtime/deployment choice is decided, likely Python FastAPI if
  Spider_XHS reuse remains the priority.
