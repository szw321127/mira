---
target: packages/admin-frontend/src/App.tsx
total_score: 18
p0_count: 0
p1_count: 2
timestamp: 2026-06-08T01-06-04Z
slug: packages-admin-frontend-src-app-tsx
---
# Impeccable Critique: packages/admin-frontend/src/App.tsx

## Design Health Score

| # | Heuristic | Score | Notes |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | Tags/progress are visible, but search/export/new-project/notification actions provide no state feedback. |
| 2 | Match System / Real World | 2 | Chinese labels are understandable, but P0/P1/P2, 18.4w, and bare dates need operational context. |
| 3 | User Control and Freedom | 1 | Drawer drill-down exists, but edit/undo/bulk/recovery paths are absent. |
| 4 | Consistency and Standards | 3 | AntD patterns are familiar; icon-only bell and English Drawer close weaken polish. |
| 5 | Error Prevention | 1 | Risk, export, and new-project flows lack guardrails, confirmations, disabled/loading states. |
| 6 | Recognition Rather Than Recall | 3 | Sidebar, tables, filters, tags, and drawer are recognizable. |
| 7 | Flexibility and Efficiency | 1 | No sorting, saved filters, keyboard paths, column controls, or bulk actions. |
| 8 | Aesthetic and Minimalist Design | 2 | Restrained but generic; equal-weight cards create low-value visual competition. |
| 9 | Error Recovery | 1 | No retry, empty, failed search, failed export, or error surfaces. |
| 10 | Help and Documentation | 1 | No inline explanation for priority, budget, risk, or first-run operation. |
| **Total** |  | **18/40** | Functional-looking, not yet trustworthy as an admin workspace. |

## Anti-Patterns Verdict

- LLM assessment: Medium AI-slop risk. The UI reads like a competent Ant Design admin scaffold rather than a tool shaped around RedNote operations.
- Deterministic scan: no detector findings, output was [] for App.tsx and styles.css.
- Browser evidence: desktop is structurally stable; narrow viewport overflows horizontally at 390px.

## Overall Impression

The admin project already has a usable shell: sidebar, top actions, metrics, project table, task board, and detail drawer. The main weakness is trust. It presents several controls as real product affordances, but the current behavior and states do not yet support an operator making decisions.

The design direction should move from generic dashboard to operational console: what is risky, who owns it, what changed, and what action should happen next.

## What Is Working

- Ant Design gives the surface immediate familiarity for admin users.
- The restrained palette is appropriate for a backend management system.
- Core nouns are present: projects, owners, budgets, status, tasks, priorities, due dates.
- The drawer is a good starting point for detail inspection.

## Priority Issues

[P1] Primary controls look actionable but are not operationally backed.
Search, notifications, export, new project, and sidebar destinations create false affordances. Either implement behavior and states, or temporarily disable/remove them with clear copy.
Suggested next command: implement action states in packages/admin-frontend/src/App.tsx and add focused tests for search/filter/export/new-project behavior.

[P1] Mobile loses navigation and has measurable horizontal overflow.
At 390x844 the document width measured 428px. The metric/admin grids and segmented filter exceed the viewport, and the sidebar disappears without a mobile replacement.
Suggested next command: add responsive nav, make table/card containers obey max-width: 100%, and redesign the segmented filter for small screens.

[P2] The hierarchy is too passive for project operations.
Four equal KPI cards do not answer the key admin question: what needs attention right now? Risk, overdue work, blocked tasks, and ownership should dominate the first screen.
Suggested next command: promote risk queue and overdue/blocker summaries above neutral aggregate metrics.

[P2] Risk is shown as a tag, not a workflow.
The interface says something is risky, but not why, how severe, who owns the fix, what changed last, or what the next action is.
Suggested next command: enrich risk rows/drawer with reason, severity, owner, last update, next action, and escalation target.

[P3] AntD defaults still show through.
The page is clean, but visually under-shaped: default card/table rhythm, generic dark sidebar, repeated title hierarchy, and mixed localization details.
Suggested next command: tighten spacing, reduce nested card feel, localize accessibility labels, and replace deprecated AntD props.

## Persona Red Flags

- Power user: no sorting, saved views, command/search behavior, bulk actions, keyboard paths, or column controls.
- Admin operator: no audit log, permission signal, notification state, export status, or confirmation flows.
- First-time manager: terms like P0/P1/P2, 18.4w, and 06/28 assume context without explanation.

## Minor Observations

- Bell button exposes “bell” instead of a localized accessible name.
- Drawer close text is “Close” while the rest of the UI is Chinese.
- 已上线 filter can produce a dead-looking state because no matching project is present.
- All progress bars appear active, which may imply live movement even when data is static.
- 项目总览 appears redundantly across sidebar, header, and title area.
- AntD warns that Statistic valueStyle and Drawer width are deprecated.

## Questions To Consider

1. 后台首页三秒内最该让管理员看到什么：风险、延期、吞吐、还是负责人负载？
2. 风险项目应该只是一个指标，还是应该变成默认工作队列？
3. 新建项目如果是主操作，页面是否要更像“立项/审核/分派”流程，而不是只看报表？
