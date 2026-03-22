# ThisIsMyDepartment.AI Current Status

This document summarizes what is already implemented in the repository, what remains intentionally incomplete, and what a new host should understand before treating the project as release-ready.

## Completed so far

### Identity and auth

Implemented:

* backend-owned session bootstrap via `GET /api/bootstrap`
* session creation via `POST /auth/handoff`
* fallback local login page via `GET /auth/login`
* reverse-proxy header login via `GET /auth/proxy-login`
* embedded auth bridge via `GET /auth/postmessage-bridge`
* stable user IDs derived from normalized verified identity

### Profiles and onboarding

Implemented:

* first-time avatar onboarding restored
* persisted avatar updates via `PUT /api/me/profile`
* current user and profile lookup via `GET /api/me`
* in-game settings UI for avatar updates

### Persistence

Implemented:

* SQLite-backed backend state by default
* persisted users, sessions, profiles, activities, and conversations
* automatic migration from legacy `server/data/state.json` into SQLite on first startup of an empty database

Default state database:

```text
server/data/state.sqlite
```

### Activity logging

Implemented:

* player chat logging
* AI-character chat logging
* room join and leave logging
* avatar update logging
* character prompt update logging
* iframe open, close, and URL-change logging

### Conversations

Implemented:

* persisted player-to-player conversation storage
* persisted user-to-agent conversation storage
* frontend conversation window backed by server-side conversation APIs

### AI characters

Implemented:

* backend-routed agent chat through `/api/agents` and `/api/agents/:agentId/chat`
* shared chat path for teacher and student AI-controlled characters
* user-editable prompt for the user's own offline AI-controlled character
* deployment-owned default teacher characters seeded into persistence when missing

Current provider support:

* mock provider
* OpenAI provider via `OPENAI_API_KEY`

### Realtime and room sync

Implemented:

* integrated Socket.IO room server inside the backend package
* frontend room sync using the backend as the authoritative multiplayer server
* stable user ID handling for join, leave, reconnect, and character updates
* repeatable realtime smoke test script in `scripts/realtimeSmokeTest.js`

### Frontend runtime cleanup already done

Implemented:

* browser runtime entry now uses `ThisIsMyDepartmentApp`
* backend-bound browser requests include credentials
* localhost Jitsi auto-connect is gated behind explicit config to avoid `/http-bind` noise during normal local development
* settings and dialogue UI are now aligned with the current backend-driven model
* copyable frontend and backend environment templates now exist for local and production setup

## Current supported local deployment shape

Supported and tested shape:

1. Run backend on `127.0.0.1:8787`.
2. Run frontend webpack dev server on `127.0.0.1:8000`.
3. Let frontend bootstrap from backend.
4. Use fallback login locally or configure one of the supported auth handoff modes.

## What is still incomplete

These are known non-final areas, not hidden surprises:

* broader provider support beyond mock and OpenAI
* remaining cleanup of historical asset names, demo copy, and archived reference material
* modernization of the legacy frontend packaging and Socket.IO dependency stack
* public release polish for docs, templates, and maintainer metadata
* broader end-to-end testing coverage

## Important technical constraints

### Node version

The legacy frontend toolchain is still pinned to Node `16.20.2`.

### Frontend build behavior

The frontend dev server serves emitted files from `lib/`.

That means:

* source edits in `src/` are not sufficient by themselves
* if the browser does not reflect a visual or logic change, verify the corresponding file in `lib/` was regenerated

### Jitsi behavior on localhost

On localhost:

* Jitsi stays disabled unless explicit `TIMD_JITSI_*` variables are configured
* this is intentional to avoid repeated local `/http-bind` browser errors when no Jitsi server is present

## Release-readiness summary

The repository is usable for development and controlled self-hosting work, but it should still be treated as a project in active cleanup rather than a fully polished public release.

Practical interpretation:

* good enough for continued implementation and pilot deployment work
* not yet fully documented or polished enough to call the open-source release finished

## Where to look next

* [doc/getting-started.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/getting-started.md) for install and local usage
* [doc/auth-integration.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/auth-integration.md) for upstream login handoff patterns
* [doc/hosting.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/hosting.md) for deployment guidance
* [doc/open-source-release-checklist.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/doc/open-source-release-checklist.md) for the remaining release cleanup work
