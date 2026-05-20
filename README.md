# Analitic Dashboard

Native macOS analytics dashboard — Tauri + React + TypeScript, Material UI, Recharts.
Connects directly to a Postgres database; credentials are stored in the macOS Keychain.

## Stack

- **Tauri 2** (Rust shell) — native window, secure IPC
- **React 18 + Vite + TypeScript** — frontend
- **Material UI 6 + Recharts** — UI & charts
- **React Query** — server state caching
- **Zustand** — local session state
- **tokio-postgres** — Postgres client (Rust side)
- **keyring-rs** — credential storage in macOS Keychain

## Feature-Sliced Design

```
src/
├── app/         # init, providers, router, global styles
├── pages/       # route screens (login, dashboard)
├── widgets/     # composed UI blocks (sidebar, charts, tables)
├── features/    # user-facing units (auth-login, auth-logout)
├── entities/    # business entities (session, analytics)
└── shared/      # api client, config, lib, ui kit, types
```

Each slice splits into `ui/`, `model/`, `api/` so view, state, and IO never mix.
Every file is a single small responsibility; cross-slice imports go through `index.ts` barrels.

## Setup

```sh
# 1. Install JS deps
npm install

# 2. Install Tauri CLI prerequisites if you haven't yet
# https://tauri.app/start/prerequisites/
xcode-select --install   # macOS

# 3. Dev mode (Vite + Tauri together)
npm run tauri:dev

# 4. Production .app
npm run tauri:build
```

The first `tauri:dev` will compile the Rust dependencies and may take a few minutes.

## How the login flow works

1. User enters Postgres credentials in `LoginForm` (`features/auth-login`).
2. `save_credentials` Tauri command opens a real Postgres connection (validates the credentials), then saves them to the macOS Keychain under the service `com.analiticdashboard.app`.
3. On success, the session store is updated and the router renders the dashboard.
4. On next launch, `SessionBootstrap` calls `connect_with_saved` which reads from Keychain and reconnects automatically.
5. `LogoutButton` clears both the in-memory session and the Keychain entry.

## Analytics queries

The Rust side (`src-tauri/src/commands/analytics.rs`) assumes a generic schema:

```
events(created_at timestamptz, session_id text, kind text, device text, utm_source text)
purchases(created_at timestamptz, product_id, amount numeric, utm_source text)
products(id, name)
```

Adapt these SQL queries to match your real schema. Types returned to the frontend
are defined in both the Rust command and `entities/analytics/model/types.ts` —
keep them in sync.

## Path aliases

```ts
@app/*       -> src/app/*
@pages/*     -> src/pages/*
@widgets/*   -> src/widgets/*
@features/*  -> src/features/*
@entities/*  -> src/entities/*
@shared/*    -> src/shared/*
```

## Scripts

| Script                | What it does                          |
| --------------------- | ------------------------------------- |
| `npm run dev`         | Vite dev server only (browser)        |
| `npm run tauri:dev`   | Tauri + Vite dev (native window)      |
| `npm run build`       | Type-check + Vite production build    |
| `npm run tauri:build` | Bundle `.app` / `.dmg`                |
| `npm run typecheck`   | TypeScript check, no emit             |

## Troubleshooting (macOS "App is damaged" error)

If you download the `.dmg` directly from GitHub releases without Apple Developer signature notarization active, macOS Gatekeeper may show an error: `"Analitic Dashboard" is damaged and can't be opened.`

To run the application:
1. Open the `.dmg` and drag **Analitic Dashboard.app** into your **Applications** folder.
2. Open your terminal and run the following command:
   ```bash
   xattr -cr "/Applications/Analitic Dashboard.app"
   ```
3. Open the app normally. It will launch successfully.

