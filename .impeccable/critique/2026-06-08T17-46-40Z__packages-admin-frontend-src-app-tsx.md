---
target: packages/admin-frontend/src/App.tsx
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-06-08T17-46-40Z
slug: packages-admin-frontend-src-app-tsx
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Create success alert and dashboard metrics update are visible. |
| 2 | Match System / Real World | 4 | Project fields map to operator language: owner, status, priority, progress, budget, due date. |
| 3 | User Control and Freedom | 4 | Inline panel can be cancelled or collapsed without overlay trapping. |
| 4 | Consistency and Standards | 3 | Uses Ant Design controls consistently; inline panel is a better fit than modal/drawer for this workflow. |
| 5 | Error Prevention | 3 | Required name and owner are validated; unique key conflicts still rely on backend error copy. |
| 6 | Recognition Rather Than Recall | 4 | Defaults for status, priority, and progress reduce setup friction. |
| 7 | Flexibility and Efficiency | 3 | Inline creation is efficient; task creation is not yet exposed. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained product UI; create panel adds density only when opened. |
| 9 | Error Recovery | 3 | API errors surface through the shared operation alert. |
| 10 | Help and Documentation | 3 | Placeholders guide field format; no deeper field help yet. |
| **Total** | | **34/40** | **Healthy product UI** |

#### Anti-Patterns Verdict

The updated admin project creation flow does not read as AI-generated. It uses standard Ant Design form controls, restrained color, and an inline task pattern. The earlier modal/drawer approach created visible overlay remnants during browser verification; the inline panel removes that failure mode and better matches product UI guidance.

Deterministic scan: `detect.mjs --json packages/admin-frontend/src/App.tsx packages/admin-frontend/src/styles.css` returned `[]`.

Browser evidence: verified at `http://localhost:3002/`. The project list loaded real database records, inline creation produced a new persisted project, no `.ant-modal` or `.ant-drawer` remained after submission, document scroll width matched client width, and browser error logs were empty.

#### What's Working

- The create flow now happens in context above the dashboard metrics, so operators keep orientation while adding a project.
- The form uses familiar controls and sensible defaults for status, priority, and progress.
- Success feedback and refreshed metrics make the persistence outcome visible.

#### Priority Issues

- **[P2] Backend duplicate key errors are not yet translated for operators**
  - Why it matters: if a user reuses a project key, the raw provider/database message may be less clear than the rest of the UI.
  - Fix: catch unique constraint errors in `AdminProjectsService.createProject()` and return "项目 Key 已存在，请换一个。"
  - Suggested command: `$impeccable clarify`

- **[P2] Task creation is still missing from the management loop**
  - Why it matters: dashboard metrics are now real, but task completion data can only appear if tasks are inserted outside the UI.
  - Fix: add a task creation/edit flow scoped to a project.
  - Suggested command: `$impeccable shape`

#### Persona Red Flags

**Operations Owner**: Can now create a project without leaving the dashboard, but cannot add tasks yet, so progress data is only partially self-serve.

**First-Time Admin**: The form defaults help, but duplicate key recovery should be clearer before this is production-comfortable.

#### Minor Observations

- The inline panel is visually consistent with the existing admin card system.
- Ant Design bundle size warning remains, caused by the admin stack and not introduced by this interaction change.

#### Questions to Consider

- Should project key be hidden by default and auto-generated unless an operator explicitly opens advanced fields?
- Should tasks be the next self-serve admin feature so dashboard metrics no longer require database-side insertion?
