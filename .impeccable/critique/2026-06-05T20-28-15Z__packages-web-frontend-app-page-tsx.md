---
target: packages/web-frontend/app/page.tsx
total_score: 33
p0_count: 0
p1_count: 0
timestamp: 2026-06-05T20-28-15Z
slug: packages-web-frontend-app-page-tsx
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | 生成、封面、保存、复制状态都能被看见。 |
| 2 | Match System / Real World | 3 | 主流程贴近小红书创作，但 mock 封面仍偏模板。 |
| 3 | User Control and Freedom | 4 | 用户可换批、选大纲、编辑发布包、恢复历史。 |
| 4 | Consistency and Standards | 3 | 主要按钮和图标一致，旧历史记录仍会显示旧标题形态。 |
| 5 | Error Prevention | 3 | 下载封面会在图片未生成时禁用，草稿有去重；仍可加强长文案边界。 |
| 6 | Recognition Rather Than Recall | 4 | 大纲、发布包、历史与自动保存都在同一工作台可见。 |
| 7 | Flexibility and Efficiency | 3 | 主路径够快，键盘/批量操作还不是重点能力。 |
| 8 | Aesthetic and Minimalist Design | 3 | 视觉负载已降低，右侧发布包仍较密。 |
| 9 | Error Recovery | 3 | 图片失败态和全局错误拦截可用，恢复路径清楚。 |
| 10 | Help and Documentation | 3 | 空状态给出下一步，但无独立帮助入口。 |
| **Total** | | **33/40** | **Solid product UI** |

#### Anti-Patterns Verdict

**LLM assessment**: 不像通用 AI 聊天框了，工作台结构符合“先想法、再选方向、再产出发布包”的创作流程。之前发现的 P1 是封面标题溢出画布，已修复为两行 SVG title tspan；之前发现的内容问题是发布标题硬截断和正文 lead-in 重复，已修复。

**Deterministic scan**: detect.mjs 对 packages/web-frontend/app 返回空数组，无自动化 slop 命中。

**Visual overlays**: Codex Browser 当前 evaluate 为只读，无法做 mutable injection；未生成用户可见 overlay。fallback 使用 DOM 快照、实际点击流程、封面 SVG 提取与 PNG 预览。

#### Overall Impression

现在这个版本可以完成一次可发布草稿的主路径：输入想法、生成 3 个方向、选择大纲、生成发布包、生成封面、复制完整笔记。最大的机会是把 mock 封面升级为更像真实小红书封面的视觉模板或真实图片 provider。

#### What's Working

- 主工作流清楚：大纲选择与发布包并排，用户知道自己处在哪一步。
- 自动保存和历史记录减少重新开始成本，符合产品原则。
- 发布包有标题、正文、标签、封面提示和封面图，不再停留在“写作说明”。

#### Priority Issues

**[P2] Mock 封面仍偏示意模板**
Why it matters: 用户问“还有图呢”时，当前已经有图，但这张图更像可验证的封面占位，而不是最终小红书风格图片。
Fix: 保留当前 mock provider 做开发兜底，同时接入真实图片 provider 或更丰富的模板系统。
Suggested command: $impeccable polish

**[P3] 正文仍会重复完整主题**
Why it matters: 内容可以复制发布，但多段反复出现完整主题会显得略机械。
Fix: 后续可增加 topic alias，例如首段用完整主题，后续用“这套备餐流程”。
Suggested command: $impeccable clarify

**[P3] 历史里旧记录会保留旧标题形态**
Why it matters: 新生成记录已修复，但旧数据仍可能显示硬截断标题，容易让用户误以为问题还在。
Fix: 可以接受为历史数据，也可以在读取时做一次显示层清洗。
Suggested command: $impeccable harden

#### Persona Red Flags

**新手创作者**: 主路径可用，风险在于看到 mock 封面时可能以为“图片已经是最终生产质量”。需要在后续真实 provider 前保持状态文案清楚。

**内容运营**: 可以复制完整笔记并保存草稿，但如果批量处理多条内容，历史列表密度和筛选能力还不够。

**移动端用户**: 当前结构优先展示创作流程，符合移动端主任务；需要继续防止长中文标题在按钮和封面中溢出。

#### Minor Observations

- 生成封面按钮状态清楚，下载按钮禁用逻辑有效。
- 发布包右侧字段密度较高，但对创作工具而言可接受。
- 当前 mock cover 的底部标签区域还可以在后续进一步换行。

#### Questions to Consider

- 这张图在产品定位上应该是“开发期封面预览”，还是“可直接发布的真实图片”？
- 发布包正文是否应该继续偏稳定模板，还是更像真人小红书笔记语气？
- 历史记录是否需要过滤旧版本生成的低质量草稿？
