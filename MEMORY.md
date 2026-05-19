# Smart Calendar Manager — Project Memory

AI-powered calendar assistant that helps users manage schedules, study plans,
habits, team tasks, and daily productivity. Originally scaffolded from a Google
AI Studio app ([app link](https://ai.studio/apps/30801699-2ec7-4b1a-bb95-5b75cc0144ab)).

## Tech Stack

- **Frontend:** React 19 + TypeScript, built with Vite 6
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`), `clsx` + `tailwind-merge` (`cn` helper in [src/lib/utils.ts](src/lib/utils.ts))
- **Animation:** `motion` (Framer Motion successor)
- **Icons:** `lucide-react`
- **Dates:** `date-fns`
- **AI:** Google Gemini via `@google/genai`
- **Auth:** Firebase Auth (Google sign-in)
- **Hosting:** Firebase Hosting (`dist/` → SPA rewrite to `/index.html`)

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server on port 3000, host 0.0.0.0 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Type-check only (`tsc --noEmit`) |
| `npm run clean` | Remove `dist` and `server.js` |

## Configuration & Secrets

- **`VITE_GEMINI_API_KEY`** — required for the "Cal AI" assistant. Set in `.env`
  (copy from [.env.example](.env.example)). Vite only reads `.env` at startup,
  so restart the dev server after changes.
- ⚠️ **Security note:** any `VITE_`-prefixed var is bundled into the public
  client JS and visible to anyone. For production, the Gemini calls should be
  proxied through a backend so the key stays secret.
- **Firebase config:** [firebase-applet-config.json](firebase-applet-config.json)
  (project `smart-calander-c0d9a` — note the typo in the project ID, it's "calander").

## Architecture

### Pages ([src/pages/](src/pages/))
The app is a single-page shell ([src/App.tsx](src/App.tsx)) with a `ViewState`
that switches between five views (no router):

- **Dashboard** — today's tasks, habit streaks, notes, 25-min Pomodoro focus timer, AI insight
- **CalendarView** — Google Calendar events; clickable event detail modal with external GCal link
- **StudyPlanner** — study subjects/sessions; can push sessions to Google Calendar
- **HabitsView** — habit tracking with daily check-ins and streaks
- **TeamWorkspace** — kanban board (todo / in-progress / done)

### State ([src/lib/store.ts](src/lib/store.ts))
Tiny custom store built on `useSyncExternalStore`, **persisted to
`localStorage`** (no backend DB). Exposes hooks: `useTasks`, `useHabits`,
`useStudyPlanner`, `useNotes`, `useTeam`. Core types: `Task`, `Habit`,
`StudySubject`, `StudySession`, `Note`.

### Auth ([src/lib/auth.ts](src/lib/auth.ts))
- Firebase Google sign-in with `browserLocalPersistence` (session survives reload).
- Requests the `calendar.events` OAuth scope.
- Uses `prompt: 'select_account'` (not `consent`) to avoid forcing re-grant every sign-in.
- Caches the Google OAuth access token in `localStorage` under key `scm_gcal_token`
  with a **58-minute TTL** (slightly under the real 3600s expiry) to avoid stale-token UI.

### Calendar ([src/lib/calendar.ts](src/lib/calendar.ts))
- Wraps the Google Calendar REST API using the cached access token.
- `DEFAULT_REMINDERS`: email 1 day before + popup 30 min before, attached to every created event.
- `CalendarAuthError` is thrown when the token is missing/expired/denied
  (handled separately from API-not-enabled 403s).

### AI ([src/lib/gemini.ts](src/lib/gemini.ts))
- "Cal AI" assistant ([src/components/AIChatPanel.tsx](src/components/AIChatPanel.tsx)).
- The system prompt instructs the model to emit ```` ```action ```` JSON blocks.
- `AIActionType` covers: create_event, create/delete task, generate study plan,
  add subject/session, add/checkin/delete habit, team task CRUD, and `general`.
- Action blocks are parsed and applied to the store / calendar.

## Notes & Gotchas

- No router — navigation is `useState`-driven view switching in `App.tsx`.
- No backend/database — all app data lives in `localStorage`; clearing browser
  storage wipes tasks/habits/notes/study/team data.
- Mobile UX: sidebar is a drawer; AI panel is a full-screen overlay. Sidebar/AI
  panel default open only on desktop (`window.innerWidth >= 1024`).
- `models.json` is an untracked file in the repo root (not committed).
