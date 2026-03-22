# ThisIsMyDepartment.AI Getting Started

This guide is for developers and self-hosters who want to install the current repository, run it locally, and understand the basic usage flow.

## What you are starting

The current repository has two runtime parts:

1. A frontend client served on port `8000` by webpack dev server.
2. A backend service served on port `8787` that owns auth, profile storage, activity logging, conversation storage, agent chat, and realtime room sync.

Both are required for the normal backend-driven app flow.

## Requirements

Use these versions unless you are intentionally modernizing the stack:

* Node `16.20.2`
* npm compatible with that Node version
* a shell environment where native module builds can run

Recommended tools:

* Visual Studio Code
* modern desktop browser

macOS note:

* the backend uses `better-sqlite3`
* if native rebuilds fail because `python` is missing, provide a temporary `python` shim that points to `python3`

## Install

From the repository root:

```sh
npm install
```

That installs the root frontend dependencies and also installs the backend package under `server/` via the root `postinstall` script.

## Configure runtime variables

Frontend runtime values are read from the root `.env` file by webpack.

If you need to override the default local backend or Jitsi endpoints:

1. copy [.env.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/.env.example) to `.env`
2. edit only the values you actually need

Backend runtime values are now loaded explicitly by the backend startup path.

Default backend env file order:

1. `server/.env`
2. `server/.env.local` for normal development
3. `server/.env.production` when `NODE_ENV=production`

Shell environment variables still win over file values.

Recommended local workflow:

1. copy [server/.env.local.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.local.example) to `server/.env.local`
2. edit only the values you need

If you want a different file, start the backend with `SERVER_ENV_FILE=/path/to/backend.env`.

## Build

Compile the frontend TypeScript:

```sh
npm run compile
```

Build the backend TypeScript:

```sh
npm run server:build
```

The frontend compile emits JavaScript into `lib/`, and the browser dev server serves from those emitted files.

## Run locally

Start the backend first:

```sh
npm run server:start
```

In a second shell, start the frontend:

```sh
npm start
```

Default local addresses:

* frontend: `http://127.0.0.1:8000/`
* backend: `http://127.0.0.1:8787/`
* backend health check: `http://127.0.0.1:8787/health`

## First local login

If you have not configured upstream auth yet, use the built-in fallback login flow.

Typical local flow:

1. Open `http://127.0.0.1:8000/`.
2. The frontend requests bootstrap state from the backend.
3. If no session exists, the frontend redirects to `/auth/login`.
4. Submit the fallback form.
5. The backend creates a cookie session and redirects back to the frontend.
6. If this is the first login for that user, the app requires avatar selection before entering the world.

## Daily development loop

When changing frontend TypeScript:

```sh
npm run watch
```

Then keep `npm start` running in another shell.

When changing backend TypeScript:

```sh
npm run server:build
npm run server:start
```

Current important behavior:

* the frontend dev server serves emitted files from `lib/`
* if a source change appears missing in the browser, verify the matching file in `lib/` was regenerated
* on localhost, Jitsi stays disabled unless explicit `TIMD_JITSI_*` variables are configured

## What to verify after startup

Use this list to confirm the local stack is healthy:

* `http://127.0.0.1:8787/health` returns `{"ok":true}`
* the frontend loads without a blank screen
* fallback login works when no upstream auth is configured
* first-time users see avatar onboarding
* returning users keep the saved avatar
* AI characters can be opened for chat
* player-to-player room sync works when two browser sessions join the same room

## Basic usage

Once inside the world, the currently implemented user-facing flow is:

1. Move around the room.
2. Open conversation with AI characters.
3. Open direct conversation with nearby players.
4. Use the settings UI to update media devices, avatar appearance, and your own offline AI prompt.
5. Open embedded content through iframe-based interactables.

The backend records these activities against the stable user ID and session where applicable.

## Local data storage

By default, backend state is stored in:

```text
server/data/state.sqlite
```

You can override it with:

```sh
SERVER_STATE_DB_FILE=/custom/path/state.sqlite
```

Legacy JSON state in `server/data/state.json` is imported automatically the first time an empty SQLite database starts.

## Environment variables you will likely use first

Frontend runtime:

* `TIMD_BACKEND_BASE_URL`
* `TIMD_SOCKET_BASE_URL`
* `TIMD_JITSI_DOMAIN`
* `TIMD_JITSI_MUC`
* `TIMD_JITSI_SERVICE_URL`
* `TIMD_JITSI_CLIENT_NODE`

Backend runtime:

* `HOST`
* `PORT`
* `AUTH_SESSION_COOKIE_NAME`
* `AUTH_SESSION_TTL_SECONDS`
* `SERVER_STATE_DB_FILE`
* `OPENAI_API_KEY`

Auth integration:

* `AUTH_HANDOFF_SHARED_SECRET`
* `AUTH_JWT_SHARED_SECRET`
* `AUTH_PROXY_PROVIDER`
* `AUTH_PROXY_EXTERNAL_ID_HEADER`
* `AUTH_PROXY_DISPLAY_NAME_HEADER`
* `AUTH_POSTMESSAGE_ALLOWED_ORIGINS`

Reference templates:

* [.env.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/.env.example) for frontend runtime injection
* [server/.env.local.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.local.example) for local backend values
* [server/.env.production.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.production.example) for production backend values

## Next docs

After local startup works:

* read [doc/current-status.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/current-status.md) for the current implemented scope
* read [doc/auth-integration.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/auth-integration.md) before connecting a real upstream login system
* read [doc/hosting.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/hosting.md) before deployment
