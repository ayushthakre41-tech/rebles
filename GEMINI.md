# GEMINI.md — Event Registration Manager (ERM Agent)

> **This file is the primary handoff document for any AI model or developer continuing work on this project.**
> Read it fully before touching any code. It covers the product purpose, architecture, every file's role, design decisions, known gotchas, and conventions.

---

## 1. What This App Is

The **Event Registration Manager (ERM)** is a **human-in-the-loop AI agent** for managing event registration workflows. It is built as a full-stack Next.js 15 application with a local SQLite database.

**The core philosophy is: the agent never acts autonomously. Every write action (publish, update, export) must be explicitly approved by the organiser before it executes.**

The original specification lives at [`d:/ZIRO/Event Registration Manager.md`](./Event%20Registration%20Manager.md). Read it to understand the full requirements (FR-1 through FR-31, test cases TC1–TC4).

### Key capabilities

| Capability | Description |
|---|---|
| Event creation | Organiser fills a form; agent validates (title, date, venue, capacity, ticket rules) |
| Luma scraping | Agent fetches event data from lu.ma with automatic mock fallback if blocked |
| Registration decisions | Each registration is classified: `REGISTERED`, `WAITLISTED`, `DUPLICATE`, or `UNCERTAIN` |
| Approval gate | Every write action starts as `PENDING_APPROVAL` → must be approved → then executed |
| Verification | After execution, the agent re-reads the platform page and compares intended vs. observed state |
| CSV export | Check-in sheet gated behind an approved `EXPORT` action |
| Test suite | TC1–TC4 run fully automated with synthetic-only data |
| Chat interface | Conversational UI to drive the entire workflow |

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript) | Full-stack, API routes + React UI in one project |
| Database | **SQLite** via `better-sqlite3` | Local, zero-config, synchronous API plays well with Next.js server routes |
| Styling | **Vanilla CSS** + CSS Modules for chat page | Design guide mandates no Tailwind; global design tokens in `globals.css` |
| HTTP client | Native `fetch` (browser + Node) | No extra deps needed |
| Scraping | `cheerio` + `node:https` | Parses Luma HTML; falls back to mock data automatically |
| IDs | `uuid` v4 | All DB primary keys are UUIDs |

---

## 3. Running the App

```bash
cd d:/ZIRO/event-registration-manager
npm install          # only needed once
npm run dev          # starts on http://localhost:3000
```

- The SQLite database is created automatically at `data/erm.db` on first run. **Do not commit `data/`.**
- The app redirects `/ → /chat` (the chat agent screen).
- `next.config.ts` marks `better-sqlite3` as a server-external package — **do not remove this or the app will crash.**

---

## 4. Project Structure

```
event-registration-manager/
├── data/                        ← SQLite DB (gitignored, auto-created)
│   └── erm.db
├── next.config.ts               ← serverExternalPackages: ['better-sqlite3']
├── src/
│   ├── app/
│   │   ├── globals.css          ← ENTIRE design system (tokens, components, layout)
│   │   ├── layout.tsx           ← Root layout: app-shell + Sidebar + main
│   │   ├── page.tsx             ← redirect('/chat')
│   │   │
│   │   ├── chat/
│   │   │   ├── page.tsx         ← Chat conversation screen (client component)
│   │   │   └── chat.module.css  ← Scoped styles for chat UI only
│   │   │
│   │   ├── events/
│   │   │   ├── layout.tsx       ← Adds page-padded wrapper to all /events/* pages
│   │   │   ├── page.tsx         ← Events list
│   │   │   ├── new/page.tsx     ← Event creation form
│   │   │   └── [id]/page.tsx   ← Event detail dashboard (approval, registrations, evidence, verifications)
│   │   │
│   │   ├── approvals/
│   │   │   ├── layout.tsx       ← Adds page-padded wrapper
│   │   │   └── page.tsx         ← Global approval queue
│   │   │
│   │   ├── test-runs/
│   │   │   ├── layout.tsx       ← Adds page-padded wrapper
│   │   │   └── page.tsx         ← TC1–TC4 runner with evidence display
│   │   │
│   │   └── api/
│   │       ├── events/
│   │       │   ├── route.ts           ← GET /api/events, POST /api/events
│   │       │   └── [id]/route.ts      ← GET /api/events/:id, PUT /api/events/:id
│   │       ├── registrations/
│   │       │   └── route.ts           ← POST /api/registrations (runs decision engine)
│   │       ├── actions/
│   │       │   ├── route.ts           ← GET /api/actions, POST /api/actions
│   │       │   └── [id]/
│   │       │       ├── approve/route.ts   ← POST — approve action, snapshot approved_version
│   │       │       ├── reject/route.ts    ← POST — reject action
│   │       │       ├── execute/route.ts   ← POST — execute + trigger verification
│   │       │       └── reverify/route.ts  ← POST — re-run verification for EXECUTED action
│   │       ├── evidence/
│   │       │   └── route.ts           ← POST — scrape Luma (or mock), store evidence
│   │       ├── export/
│   │       │   └── route.ts           ← GET — CSV check-in sheet (requires approved EXPORT action)
│   │       └── test-runs/
│   │           └── route.ts           ← GET list, POST run TC1/TC2/TC3/TC4
│   │
│   ├── components/
│   │   ├── Sidebar.tsx          ← Nav sidebar (Chat Agent, New Event, All Events, Approvals, Test Runs)
│   │   └── PageWrapper.tsx      ← Simple div.page-padded wrapper (unused directly; layouts handle this)
│   │
│   └── lib/
│       ├── db.ts                ← SQLite singleton + schema init (7 tables)
│       ├── scraper.ts           ← Luma HTTP scraper + automatic mock fallback
│       ├── decisions.ts         ← Registration classification engine (FR-9 to FR-14)
│       └── validation.ts        ← Input validation helpers (FR-3, FR-4)
```

---

## 5. Database Schema (7 Tables)

All IDs are UUID v4 strings. All timestamps are ISO-8601 strings.

### `events`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `title` | TEXT | Required |
| `date` | TEXT | YYYY-MM-DD |
| `time` | TEXT | HH:MM |
| `venue` | TEXT | Required |
| `description` | TEXT | Optional |
| `capacity` | INTEGER | Must be > 0 |
| `ticket_rules` | TEXT | `FREE` \| `PAID` \| custom |
| `status` | TEXT | `DRAFT` \| `PUBLISHED` |
| `public_url` | TEXT | Populated after PUBLISH executes |
| `created_at` | TEXT | ISO timestamp |

### `registrations`
| Column | Notes |
|---|---|
| `email_normalized` | Trimmed + lowercased — used for duplicate detection |
| `status` | `REGISTERED` \| `WAITLISTED` \| `DUPLICATE` \| `UNCERTAIN` |

### `actions`
| Column | Notes |
|---|---|
| `type` | `PUBLISH` \| `REPUBLISH` \| `EXPORT` |
| `proposed_change` | JSON of the intended change |
| `approved_version` | JSON snapshot taken **at approval time** (FR-17) — execution matches this exactly |
| `status` | `PENDING_APPROVAL` → `APPROVED` → `EXECUTED` (or `REJECTED`) |
| `idempotency_key` | UUID, UNIQUE — prevents double-execution (FR-18) |

### `verifications`
| Column | Notes |
|---|---|
| `intended_state` | JSON of what the agent expected to see |
| `observed_state` | JSON of what was scraped/checked after execution |
| `result` | `VERIFIED` \| `FAILED` \| `PENDING` |

### Other tables
- **`evidence`** — raw scraped fields with source URL and timestamp (FR-5, FR-6)
- **`decisions`** — per-registration audit trail of which rule was applied and why
- **`test_runs`** — TC1–TC4 run history with input, expected, actual, evidence_ref, passed flag

---

## 6. Core Business Logic

### Action State Machine
```
                     ┌──────────────┐
  POST /api/actions  │              │
 ─────────────────►  │PENDING_APPROVAL│
                     │              │
                     └──────┬───────┘
                   approve  │  reject
                    ┌───────┴──────┐
                    ▼              ▼
               APPROVED        REJECTED
                    │
               execute
                    ▼
               EXECUTED  ──►  verification runs
```

**Critical rule:** The `approved_version` JSON is snapshotted at approval time. When the action executes, it uses that snapshot — **not** the current event state. This means if someone edits the event between approval and execution, the approved version wins.

### Decision Engine (`src/lib/decisions.ts`)
Classifies each registration in this order:
1. **DUPLICATE** — `email_normalized` already exists for this event (case-insensitive, whitespace-trimmed)
2. **WAITLISTED** — registered count >= capacity
3. **REGISTERED** — passes all checks
4. **UNCERTAIN** — catches edge cases (shouldn't happen in normal flow)

### Scraper + Mock Fallback (`src/lib/scraper.ts`)
- Attempts to fetch and parse the real Luma page via HTTP
- Falls back to mock data automatically on: `401`, `403`, `429`, network error, or timeout
- Mock URLs (`https://lu.ma/mock-*`) are **never scraped** — they always use mock data
- The mock returns realistic-looking but synthetic event data

### Verification Logic (`src/app/api/actions/[id]/execute/route.ts`)
After every `EXECUTE`:
- If the public URL contains `/mock-` → always `VERIFIED` (synthetic events can't be scraped)
- If the URL is a real Luma URL → scrape and compare title + venue
- If scrape is blocked → `PENDING`

> ⚠️ **Known historical bug (fixed):** The condition was `startsWith('mock')` which never matched `https://lu.ma/mock-...`. This caused all mock-event verifications to show `FAILED`. The fix was changing to `.includes('/mock-')`. If you see FAILED on old events, use the **🔄 Re-verify** button on the event detail page.

---

## 7. Chat Interface (`/chat`)

The chat page is the primary UX entry point. Key architecture notes:

### Session persistence
- Messages and agent state are stored in `sessionStorage` under keys `erm_chat_messages` and `erm_chat_agent_state`
- The conversation **persists across navigation** within the same browser tab
- A new browser tab starts a fresh session
- The **"+ New Chat"** button (visible in the header when messages exist) clears storage and resets to the greeting

### Greeting dedup
A `useRef(false)` guard (`greeted`) prevents the greeting from firing twice in React 18 strict mode. The greeting also skips entirely if `sessionStorage` has existing messages.

### Multi-step form flow
When the user says "Create an event", the agent enters `collecting` step in `AgentState`. It then asks for fields sequentially: `title → date → time → venue → capacity`. The `pendingField` on `AgentState` tracks which field is expected next. All text messages are routed through `handleCollecting()` during this step.

### Markdown rendering
The `renderMd()` function at the top of `chat/page.tsx` handles `**bold**` text in agent messages. It is intentionally minimal — do not replace it with a full markdown library unless you need code blocks or tables in chat.

### Intent detection
After form collection, free-text messages go through keyword matching in `send()`. The keywords are loose — "create", "test", "list", "approvals", etc. Improve or extend this if you add more capabilities.

---

## 8. Design System

All visual tokens are in [`src/app/globals.css`](./src/app/globals.css). **Do not add inline hex colors anywhere.** Always use CSS variables.

### Key token groups
```css
/* Backgrounds */
--bg-base       /* deepest background */
--bg-surface    /* cards, sidebar */
--bg-elevated   /* chips, inputs */

/* Text */
--text-primary  /* headings, important values */
--text-secondary
--text-muted    /* labels, timestamps */

/* Accent (violet) */
--accent          /* #7c6ff7 */
--accent-hover    /* lighter */
--accent-dim      /* very subtle bg tint */
--accent-glow     /* for box-shadow glows */

/* Status colors */
--status-registered   /* green */
--status-waitlisted   /* amber */
--status-duplicate    /* orange */
--status-uncertain    /* yellow */
--status-verified     /* teal */
--status-failed       /* red */
--status-rejected     /* rose */
```

### Layout
- `app-shell` — flex row; sidebar (240px) + main (flex: 1)
- `main-content` — `height: 100vh`, `overflow-y: auto`, **no padding** (padding is added by sub-layouts)
- `page-padded` — `padding: var(--space-8)`, `max-width: 1100px` — applied via `layout.tsx` in each route group
- `/chat` manages its own full-height layout without `page-padded`

### Reusable CSS classes (defined in globals.css)
`card`, `btn btn-primary/secondary/success/danger`, `badge badge-{status}`, `stat-card`, `stat-label`, `stat-value`, `section`, `section-title`, `table-wrap`, `alert alert-info/warn`, `loading-bar`, `animate-in`, `spinner`, `diff-row`, `diff-from`, `diff-to`

---

## 9. Test Cases (TC1–TC4)

All test cases use **100% synthetic data** — no real emails, no real people, no real events. Each run is stored in `test_runs` with full evidence references.

| Case | Scenario | Expected result |
|---|---|---|
| **TC1** | Valid event → approve publish → verify | `EXECUTED` + `VERIFIED` |
| **TC2** | Event capacity 3 → 5 registrations | 3 `REGISTERED`, 2 `WAITLISTED` |
| **TC3** | Same email submitted twice with case/whitespace variants | 1 `REGISTERED`, 2 `DUPLICATE` |
| **TC4** | Published event → venue change approved + venue change rejected | Approved: venue updated + `VERIFIED`; Rejected: action `REJECTED` |

Run via: **Test Runs page** → "Run All Test Cases" button, or `POST /api/test-runs` with body `{ "testCase": "TC1" }`.

---

## 10. API Reference

### Events
| Method | Path | Description |
|---|---|---|
| GET | `/api/events` | List all events |
| POST | `/api/events` | Create event (validates all fields) |
| GET | `/api/events/:id` | Get event with registrations, actions, verifications, evidence |
| PUT | `/api/events/:id` | Update event fields |

### Actions
| Method | Path | Description |
|---|---|---|
| GET | `/api/actions` | List all actions (optionally filter by eventId) |
| POST | `/api/actions` | Create action (`PUBLISH`, `REPUBLISH`, `EXPORT`) |
| POST | `/api/actions/:id/approve` | Approve — snapshots `approved_version` |
| POST | `/api/actions/:id/reject` | Reject |
| POST | `/api/actions/:id/execute` | Execute (must be `APPROVED`) + runs verification |
| POST | `/api/actions/:id/reverify` | Re-run verification for an already-`EXECUTED` action |

### Other
| Method | Path | Description |
|---|---|---|
| POST | `/api/registrations` | Register attendee — runs decision engine |
| POST | `/api/evidence` | Trigger Luma scrape for an event |
| GET | `/api/export?eventId=` | Download CSV check-in sheet (requires approved EXPORT action) |
| GET | `/api/test-runs` | List all test run records |
| POST | `/api/test-runs` | Run a test case: `{ testCase: "TC1" \| "TC2" \| "TC3" \| "TC4" }` |

---

## 11. Conventions & Rules

1. **No raw JSON in the UI.** Data is displayed as label+chip rows (`InputChip`) or pill tags (`EvidenceTag`). Never render `JSON.stringify(...)` directly into JSX.

2. **No `any` types.** Use typed interfaces. The codebase is fully typed.

3. **Server components for API routes, client components for pages.** All `app/*/page.tsx` files are `'use client'`. All `app/api/**/route.ts` files are server-only.

4. **Database access only in API routes.** Never import `getDb()` from a client component or page. Only `lib/*.ts` and `app/api/**/*.ts` touch the DB.

5. **`better-sqlite3` is synchronous.** Do not wrap DB calls in `Promise`. Do not use `await` on them. The `runVerification` function uses `async` only because the scraper is async — the DB writes inside are synchronous.

6. **Idempotency keys.** Every action has a unique `idempotency_key`. The `/execute` route ignores repeated calls with the same key gracefully.

7. **Design tokens always.** Never hardcode hex colors, pixel values for spacing, or border-radius. Use `var(--...)` CSS variables from `globals.css`.

8. **Synthetic data only in test cases.** Do not use real email addresses, real names, or real event URLs in `test-runs/route.ts`.

9. **Mock URL detection.** The canonical check for whether a URL is a mock is `.includes('/mock-')`. Do NOT use `.startsWith('mock')` — it will break because real mock URLs start with `https://`.

10. **Chat session storage keys:**
    - `erm_chat_messages` — serialized `Message[]`
    - `erm_chat_agent_state` — serialized `AgentState`

---

## 12. Known Issues & Future Work

### Known limitations
- **Prompt in UI for venue edit.** The "Edit & Republish" button on the event detail page uses `window.prompt()` to collect the new venue. This is a placeholder — replace with a proper modal or inline edit form.
- **Chat intent detection is keyword-based.** It's not an LLM. If you integrate a real AI backend, replace the keyword matching in `send()` with an API call.
- **No auth.** There is no authentication layer. Anyone on the local network can access and approve actions. Add NextAuth or similar if deploying beyond localhost.
- **Single organiser.** The approval model assumes one organiser. Multi-user approval workflows would require a user/role system.

### Natural next steps
- Connect the chat to a real LLM (Gemini, GPT-4, etc.) for true natural language understanding
- Add a modal for venue editing instead of `window.prompt()`
- Add email notifications on approval requests
- Add pagination to the events list and registrations table
- Make the app deployable (swap SQLite for PostgreSQL / PlanetScale, add auth)

---

## 13. Files to Never Break

These files are load-bearing. Be very careful editing them:

| File | Why |
|---|---|
| [`src/lib/db.ts`](./src/lib/db.ts) | Database singleton + schema. Schema changes require migration logic (currently uses `CREATE TABLE IF NOT EXISTS`). |
| [`src/lib/decisions.ts`](./src/lib/decisions.ts) | The classification engine. TC2 and TC3 depend on exact behaviour. |
| [`next.config.ts`](./next.config.ts) | `serverExternalPackages: ['better-sqlite3']` — removing this breaks the build. |
| [`src/app/globals.css`](./src/app/globals.css) | All CSS tokens. Removing or renaming a token will silently break the UI. |
| [`src/app/api/actions/[id]/execute/route.ts`](./src/app/api/actions/%5Bid%5D/execute/route.ts) | Contains the verification logic. The `/mock-` check is critical — see §6. |

---

## 14. Git / Repo Notes

The `data/` directory (SQLite file) should be in `.gitignore`. If it is not, add it:

```
# .gitignore
data/
.next/
node_modules/
```

The `.next/` build cache and `node_modules/` should also be excluded.
