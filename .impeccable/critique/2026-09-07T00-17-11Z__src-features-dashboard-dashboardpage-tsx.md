---
target: Home
total_score: 21
p0_count: 0
p1_count: 4
timestamp: 2026-09-07T00-17-11Z
slug: src-features-dashboard-dashboardpage-tsx
---
# Critique: Home (`DashboardPage.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Health is split three ways (Next link, Health row, footer). Places shows SFTP only and hides Local. |
| 2 | Match System / Real World | 2 | "SFTP set", "enoch", "orphan limits", "Last import" vs footer "synced". |
| 3 | User Control and Freedom | 3 | Easy exit via sidebar. |
| 4 | Consistency and Standards | 2 | Same actions twice (Next + Quick steps). Profile name repeated. Import vs sync wording. |
| 5 | Error Prevention | 2 | Primary is Sync while 2 errors exist; 175 warnings have no rank. |
| 6 | Recognition Rather Than Recall | 3 | Labels exist; bars still need a legend (classes vs nominal). |
| 7 | Flexibility and Efficiency | 2 | No accelerators; Home is a second map of pages already in the sidebar. |
| 8 | Aesthetic and Minimalist Design | 1 | Six same-weight sections on one field. Economy and Spawn dominate. |
| 9 | Error Recovery | 2 | "2 errors in Health" does not name the files or the fix. |
| 10 | Help and Documentation | 2 | Quick steps compete with Next. Getting started is a far-right whisper. |
| **Total** | | **21/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM assessment**: Less SaaS-card than before, but now it is the other AI tell: a long editorial list. Same `type-section` cadence, same three-column numbered steps, same thin hairline bars repeated for two different metrics. Someone can still say "AI made a dashboard, then deleted the cards."

**Deterministic scan**: `detect.mjs` on `src/features/dashboard/DashboardPage.tsx` returned `[]` (exit 0). No gradient-text, side-stripe, or eyebrow-class hits. The failures are IA and density, not banned CSS motifs.

**Visual overlays**: No browser injection. Target is a Tauri window. Fallback: operator screenshot of Home.

## Overall Impression

The page tells the truth, then keeps talking. The operator asked for critical status plus a guide. They got both, plus a types.xml digest, plus spawn rollups, plus the same loop written twice. Nothing is wrong in isolation. Together it is a wall.

Biggest opportunity: decide what Home is allowed to be, then cut everything else below the fold or off the page.

## What's Working

- Sync to local as the rust button is the only clear "do this" on the screen.
- Health counts use color as state (2 errors, 175 warnings), not decoration.
- Quick steps are a real sequence, not fake 01/02/03 eyebrows.

## Priority Issues

- **[P1] Two jobs, one scroll.** Next (act) and Economy/Spawn (browse) share the same weight. Why it matters: the eye never lands. Fix: one job above the fold; lists behind a fold, a tab, or not here. Suggested command: `$impeccable distill Home`

- **[P1] Next and Quick steps say the same three things.** Sync, Push, Types appear as buttons and again as 1/2/3. Why it matters: the operator has to decide which block is the real instruction. Fix: keep one. Suggested command: `$impeccable distill Home`

- **[P1] Sections bleed.** Same black field, same title size, no grouping surface. Why it matters: "This server" leaks into "Next" into "Quick steps". Fix: vary density and one grouping device (a rule, a panel for the action band only, or a two-pane layout). Suggested command: `$impeccable layout Home`

- **[P1] Places is incomplete.** "SFTP set" + host. Local folder is missing even when it exists. Why it matters: the daily loop is Workspace / Local / Remote. Fix: three places or do not call it Places. Suggested command: `$impeccable clarify Home`

- **[P2] Health is tripled.** Red line under Next, Health row, footer. 175 warnings equal visual noise. Why it matters: either panic or ignore. Fix: one Health sentence; hide zero info; do not restyle 175 as a hero. Suggested command: `$impeccable quieter Home`

- **[P2] Identical hairline bars for two metrics.** Economy = class counts. Spawn = nominal. They look the same. Why it matters: you cannot tell what the number means without reading the hint. Fix: different treatment, or drop one. Suggested command: `$impeccable typeset Home`

## Persona Red Flags

**Alex (power user)**: Skips Quick steps. Wants dirty / errors / Sync. The rest is a slower Items page. Three large buttons when workspace is already clean.

**Jordan (first-timer)**: "Places / SFTP set" does not teach Workspace vs Local vs Remote. Next and Quick steps contradict each other in priority (buttons vs numbered guide).

**Night operator (product user)**: 175 warnings with no "what matters". Will either open Health and drown, or Sync anyway.

## Cognitive load

Failed: single focus, chunking, grouping, visual hierarchy, one thing at a time, minimal choices, progressive disclosure. **High.**

Visible decisions on first screen: 3 buttons + 3 step links + Getting started + Open Health + 4 health stats + 12+ bar rows. Well over 4.

## Minor Observations

- Header "Working on Endure and Survive" repeats the profile picker.
- Map shows `enoch` (id), not Livonia.
- Last import vs footer "synced 2m ago" looks like two clocks.
- Open Types appears in Next and in step 1.
- Mission files section (if still below the fold) is a third copy of sidebar destinations.

## Questions to Consider

- If Home can only keep one sentence of help, is it the buttons or the 1/2/3?
- Would a confident Home stop after status + one action?
- Does Economy belong on Home at all, or only on Items?
