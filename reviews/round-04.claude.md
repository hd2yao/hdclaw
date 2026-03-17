# Claude Plan Review - Round 04

## Findings
| ID | Severity | Section | Issue | Suggested Change |
|----|----------|---------|-------|------------------|
| C-R04-001 | Blocking | Frontend Design - Figma Workflow | Plan does not mention Figma at all. User explicitly requested wireframes first, then high-fidelity Figma designs, then implementation against approved Figma nodes. | Add Figma Design Workflow section: (1) Create wireframes for 4 pages (overview, node detail, agent timeline, alerts/events), (2) Get wireframe approval, (3) Create high-fidelity Figma designs, (4) Implementation strictly against Figma node IDs |
| C-R04-002 | Blocking | Frontend Design - Missing Alerts/Events Page | Codex identified 4 key pages including "alerts / events page" but the plan's Frontend Design section only covers 3 areas: node fleet sidebar, main summary+details, agent table+timeline. No alerts page. | Add Alerts/Events page to Frontend Design section with wireframe and high-fidelity specs. Include alert list, severity levels, filtering, and alert detail view. |
| C-R04-003 | Blocking | Frontend Design - Design-to-Code Handoff | No clear process for translating Figma designs to code. Missing: Figma file URL, component naming convention mapping, token/style guide extraction, responsive variant documentation. | Add Design Handoff section specifying: Figma file location, component mapping table (Figma name → code component), design tokens (colors, spacing, typography) to be extracted, how responsive variants are documented in Figma |
| C-R04-004 | Important | Frontend Design - Component Inventory | Plan mentions creating `GlobalSummary.tsx`, `DashboardSkeleton.tsx` but no component inventory or Figma component correspondence. | Create component inventory: list all new components needed, mark which are from Figma vs复用现有, specify Figma node IDs once designs exist |
| C-R04-005 | Important | Task Breakdown - Figma Tasks Missing | Task 5 covers component implementation but no preceding task for Figma design creation and approval. | Add Task 0 (or split Task 5): Create wireframes → Review → Create high-fidelity designs → Get approval → Export Figma node reference for each component |
| C-R04-006 | Important | Frontend Design - Responsive Variants | Plan mentions responsive breakpoints but doesn't specify how Figma handles mobile/tablet variants (separate frames? auto-layout? responsive resizing?). | Clarify Figma approach: use separate frames for each breakpoint, or use constraints/auto-layout, and document which approach in design spec |

## Summary
- Blocking count: 3
- Important count: 3
- Minor count: 0
- Verdict: BLOCKED
