<p align="center">
  <img src="assets/logo/greenprompt-logo.png" alt="GreenPrompt Logo" width="200">
</p>

# GreenPrompt

A browser extension that optimizes ChatGPT prompts by removing unnecessary words while preserving meaning — reducing computational overhead and environmental impact.

## Features

- **Politeness Removal** — Strips greetings, thank-yous, and pleasantries
- **Filler Word Elimination** — Removes "actually", "basically", "just", "really", etc.
- **Word Simplification** — Replaces complex words (elaborate → explain, utilize → use)
- **Context Awareness** — Preserves quoted content and topic-relevant phrases
- **Bilingual Support** — English and German language optimization
- **Non-Blocking Processing** — Runs NLP asynchronously via background service worker messaging

## Optimization Scope

| Level | Example |
|-------|---------|
| Word | "really", "just", "basically" |
| Phrase | "could you please", "thanks in advance" |
| Sentence | Greeting sentences, closing pleasantries |
| Paragraph | Multi-sentence filler removal |

## Research Configuration [EXPERIMENTAL]

Hidden feature toggles in `content.js` for research purposes:

```javascript
const RESEARCH_CONFIG = {
  nudging: false,      // Highlights optimized text, prominent accept button
  gamification: false  // Shows level, tree health, achievement stats
};
```

| Config | Effect |
|--------|--------|
| `nudging: true` | Visual emphasis on optimized prompt |
| `gamification: true` | Progress tracking with levels and stats |

## Design

- **Color Palette**: Neutral grey/white (research-neutral, no green bias)
- **Modal**: Non-intrusive overlay on ChatGPT
- **Popup**: Minimal logo-only header

## Installation

1. Clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select folder

## Privacy

All processing happens locally. No external API calls, no data collection.

## Local Study Logging

The extension now includes a unified local logging layer via `logging.js`.

### Goals

- Capture research-relevant interactions consistently across popup, content modal, and background workflows.
- Keep all study logs local (no continuous upload).
- Provide easy export in both machine-friendly and spreadsheet-friendly formats.
- Enforce privacy-first defaults: prompt text logging starts disabled and requires explicit user opt-in in the popup.

### Storage Model

Logs are stored in `chrome.storage.local` under dedicated namespaces:

- `studyLogs_events`: append-only event stream
- `studyLogs_promptRecords`: one consolidated record per prompt flow
- `studyLogs_counters`: aggregate counters
- `studyLogs_meta`: logger metadata (schema version, init timestamp)
- `studyLogs_settings`: logger settings (prompt text mode, limits, CSV delimiter)

Default logger setting:

- `promptTextMode = none` (no full prompt text stored)
- User can opt in via popup toggle (`Prompt text logging`) to switch mode to `full`

### Event Schema

Each event entry includes:

- `eventId`
- `schemaVersion`
- `appVersion`
- `timestampISO`, `timestampMs`
- `eventType`
- `source` (`popup`, `content`, `background`)
- `participantUUID`
- `sessionId`
- `environment`
- `featureFlags`
- `payload`

### Prompt Record Schema (Per Prompt)

Each `studyLogs_promptRecords` entry includes:

- Prompt session lifecycle: `promptSessionId`, start/end timestamps, dwell time
- Decision path: action (`accept`, `reject`, `edit`, `close`, `empty_warning`), decision method (`button_click`, `enter_key`, etc.)
- Slider history and final selection
- Prompt metrics: word count, token estimate, optional full prompt text
- Impact metrics: score points, CO2, water, energy
- Gamification context (when active): level and score context

### Captured Interaction Categories

- Popup:
  - popup session started/ended (dwell)
  - onboarding screen visibility and UUID submit attempts (valid/invalid)
  - follow-up button eligibility and clicks
  - panel-view events (gamification, impact, trees, awards)
- Content modal:
  - prompt intercepted
  - modal shown/closed (with dwell)
  - slider changes
  - accept/reject/edit actions
  - enter-key accept
  - duplicate-removal usage
  - empty optimization warning
- Background:
  - extension install/update/startup lifecycle
  - reminder scheduling/resync reasons
  - alarm receipt/firing

### Export

Popup includes a local export panel for researcher/debug workflows:

- `JSONL Export`: exports `studyLogs_events` as one JSON object per line
- `CSV Export`: exports prompt records as semicolon-delimited CSV (Excel-friendly)

By default, this export panel is hidden for participants and only shown when the internal debug flag is enabled.

No log data is transmitted externally by these exports.

### Debug Module Isolation

Debug UI and manual debug actions are isolated in `debug.js`.

- `popup.js` now loads `debug.js` optionally at runtime.
- If `debug.js` exists, debug controls are initialized.
- If `debug.js` is removed, the extension continues to work normally without debug controls.

This allows preparing a release build by removing only `debug.js`, while keeping onboarding, prompt optimization, logging opt-in toggle, and study flows operational.

## NLP Architecture

- `nlp-pipeline-core.js`: local DE/EN optimization pipeline (POS heuristics, dependency-proxy phrase protection, replacements, filler filtering, empty-check, length instruction helper)
- `background.js`: async optimization endpoint that runs the NLP core in the extension service worker
- `content.js`: UI interception and async background orchestration with local fallback

## Score And Impact Formula

The extension uses the thesis-based dynamic formula model for score and impact.

### Base values by selected response length

| Length | Base Score | Base Water Saving | Base Energy Saving |
|--------|------------|-------------------|--------------------|
| `1 sentence` | `+3` | `+30 ml` | `+6.305 Wh` |
| `2 sentences` | `+2` | `+20 ml` | `+6.11 Wh` |
| `1 paragraph` | `+1` | `+10 ml` | `+4.55 Wh` |
| `full` | `+0` | `+0 ml` | `+0 Wh` |

### Dynamic token contribution

- `tokenSaved = max(0, estimateTokens(original) - estimateTokens(optimized))`
- `score += tokenSaved * 0.05`
- `water += tokenSaved * 0.05 ml`
- `energy += tokenSaved * 0.0000013 Wh`

### High-compute rules

- If at least one high-compute word is present in the optimized prompt:
  - `score -= 1`
  - `water -= 15 ml`
  - `energy -= 2 Wh`
- If at least one high-compute word was replaced from original to optimized:
  - `score += 1`
  - `water += 15 ml`
  - `energy += 2 Wh`

High-compute words currently include:
`analyse`, `analyze`, `justify`, `explain`, `recommend`, `create`, `report`, `measure`, `write`, `develop`, `design`, `build`, `identify`.

### Finalization and storage

- If original and optimized prompt are identical: all savings and score are `0`.
- Score is rounded up (`ceil`) and clamped to `[0, 5]`.
- Water and energy are rounded for stable display.
- CO2 is derived from energy via `co2 = energyWh * 0.42`.
- Energy is stored canonically in `Wh`; `uWh` is derived from `Wh` to avoid drift.
