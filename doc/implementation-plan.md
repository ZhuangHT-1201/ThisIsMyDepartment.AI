# ThisIsMyDepartment.AI Implementation Plan

## Purpose

This document translates the overhaul spec into a concrete execution plan for this repository.

It is intentionally repo-specific. The goal is to identify the order of work, the files most likely to change, the new modules that need to be introduced, and the acceptance criteria for each phase.

## Guiding Rules

1. Fix identity first. Do not build persistence or agent context on top of transient usernames.
2. Introduce a backend before replacing the Python agent bridge.
3. Reuse the working parts of the current frontend instead of rewriting the game client from scratch.
4. Make the browser-hosted deployment safe by keeping provider secrets on the server side.
5. Keep migration steps small enough to test independently.

## Current Repo Baseline

- Existing client/game code lives under [src](src).
- Existing docs now include the target architecture in [doc/thisismydepartment-overhaul-spec.md](doc/thisismydepartment-overhaul-spec.md).
- Existing package configuration now includes a frontend root package in [package.json](package.json) and a backend service package in [server/package.json](server/package.json).
- The backend service already owns authenticated bootstrap, profile, activity, conversation, and agent chat routes.
- Shared frontend/backend contracts live under [shared/types](shared/types).
- Persistence is now SQLite-backed through [server/src/storage/stateStore.ts](server/src/storage/stateStore.ts).

## Status Snapshot

- Completed: shared contracts, backend scaffold, authenticated bootstrap, avatar onboarding restore, activity logging, backend agent chat, unified conversation persistence, SQLite persistence, auth integration docs, hosting docs, and integration of the authoritative realtime socket server into the backend package.
- In progress: release cleanup for open-source publication, remaining legacy naming cleanup, and deployment polish.
- Still open: broader provider integrations beyond the current mock/OpenAI path, deeper internal rename cleanup, richer conversation-history replay in the frontend, and coordinated modernization of the legacy Socket.IO client/server stack.

## Release Risk Notes

- The backend package under [server/package.json](server/package.json) currently has a clean production dependency audit.
- The remaining production dependency findings in the root package are concentrated in the legacy `socket.io-client` stack used by [src/engine/online/OnlineService.ts](src/engine/online/OnlineService.ts).
- Because the browser and backend now share a legacy Socket.IO protocol contract inside this repository, a major Socket.IO upgrade must be treated as a coordinated client/server change rather than a local-only package bump.

## Proposed Repo Layout Target

The repo should move toward this shape:

```text
src/                     existing frontend game client
server/                  new backend service
shared/                  shared types used by frontend and backend
doc/                     architecture, implementation, and hosting docs
scripts/                 build and utility scripts
```

The first implementation pass does not need to fully convert the repository into a monorepo. A lightweight incremental structure is enough:

- keep the current frontend in place
- add a new `server/` package
- add a new `shared/` folder for shared TypeScript contracts

## Phase 0: Stabilize The Plan

### Goal

Lock down the target contracts and directory strategy before changing runtime behavior.

### Deliverables

- architecture spec complete
- implementation plan complete
- initial shared type contract draft

### Files to add or update

- [doc/thisismydepartment-overhaul-spec.md](doc/thisismydepartment-overhaul-spec.md)
- [doc/implementation-plan.md](doc/implementation-plan.md)
- `shared/types/*.ts`

### Acceptance criteria

- frontend and backend bootstrap payload shape is defined
- normalized user model is defined
- activity event schema is defined
- agent chat request and response schema is defined

## Phase 1: Introduce Shared Contracts

### Goal

Create one source of truth for the data exchanged between frontend and backend.

### New files

- `shared/types/user.ts`
- `shared/types/profile.ts`
- `shared/types/session.ts`
- `shared/types/activity.ts`
- `shared/types/agent.ts`
- `shared/types/bootstrap.ts`
- `shared/types/index.ts`

### Key types to define

```ts
DepartmentUser
UserProfile
AppSession
ActivityEvent
BootstrapResponse
AgentDefinition
AgentChatRequest
AgentChatResponse
Character prompt settings
```

### Existing frontend files likely to consume these types later

- [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts)
- [src/main/agents/AgentDefinition.ts](src/main/agents/AgentDefinition.ts)
- [src/main/services/LLMAgentService.ts](src/main/services/LLMAgentService.ts)

### Acceptance criteria

- the shared contracts compile cleanly
- frontend types stop depending on ad hoc request shapes where practical
- the new contracts are written for browser and server use

Status: completed

## Phase 2: Scaffold The Backend Service

### Goal

Add a backend package that can own auth, bootstrap, persistence, and agent orchestration.

### Recommended minimum structure

```text
server/
  package.json
  tsconfig.json
  src/
    app.ts
    config.ts
    routes/
      auth.ts
      bootstrap.ts
      activities.ts
      agents.ts
      profile.ts
    services/
      auth/
      users/
      activities/
      agents/
      prompts/
    adapters/
      auth/
    storage/
      memory/
```

### Recommended first backend behavior

- simple Node/TypeScript HTTP API
- in-memory storage for initial development
- explicit interface boundaries so storage can later move to SQLite or Postgres

### Acceptance criteria

- `GET /api/bootstrap` returns a mocked but valid payload
- backend starts independently in development
- frontend can reach backend locally

Status: completed, then extended beyond the original in-memory target with session-backed routes and SQLite persistence

## Phase 3: Authentication Handoff And Session Bootstrap

### Goal

Replace the Guest auto-start with authenticated bootstrap.

### Backend work

- implement `POST /auth/handoff`
- implement `GET /api/bootstrap`
- add session creation and validation
- add pluggable auth verifier interface

### Suggested auth adapter interface

```ts
interface AuthHandoffAdapter {
    name: string;
    verify(payload: unknown): Promise<VerifiedIdentity>;
}
```

### Frontend work

- add bootstrap loader before game startup
- stop hardcoding Guest in [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts)
- introduce a user/session state holder in the frontend
- make display name come from authenticated user data

### Existing files likely to change

- [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts)
- [src/engine/online/OnlineService.ts](src/engine/online/OnlineService.ts)
- [src/Jitsi.ts](src/Jitsi.ts)

### New frontend files likely needed

- `src/main/services/bootstrap.ts`
- `src/main/services/session.ts`
- `src/main/types/currentUser.ts`

### Acceptance criteria

- frontend startup waits for bootstrap
- the game runs with a stable `userId` and display name from backend
- `OnlineService` no longer treats username as canonical identity
- the legacy name input is removed from the identity-defining path

Status: completed, with shared-secret, JWT, reverse-proxy, and embedded `postMessage` handoff modes now supported

## Phase 4: Rework Avatar Onboarding

### Goal

Turn the existing title scene into first-time profile setup and avatar editing.

### Implementation approach

- reuse sprite carousel behavior from [src/main/scenes/TitleScene.ts](src/main/scenes/TitleScene.ts)
- remove free-text username ownership from this scene
- load saved profile on startup
- only show onboarding when `profile.avatar` is missing

### Backend work

- implement `GET /api/me`
- implement `PUT /api/me/profile`

### Frontend files likely to change

- [src/main/scenes/TitleScene.ts](src/main/scenes/TitleScene.ts)
- [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts)
- [src/main/nodes/PlayerNode.ts](src/main/nodes/PlayerNode.ts)

### Acceptance criteria

- first-time user is required to pick an avatar before entering the world
- returning user receives the saved avatar automatically
- changing avatar updates persisted profile data

Status: completed

## Phase 5: Introduce Durable Activity Logging

### Goal

Persist user interactions under stable user IDs and sessions.

### Backend work

- implement `POST /api/activities`
- define append-only activity storage interface
- store session-linked events

### Frontend events to emit first

- user-to-agent message sent
- agent reply received
- user-to-user message sent
- iframe opened
- iframe closed
- iframe URL updated

### Existing frontend files likely to change

- [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts)
- [src/main/nodes/LLMAgentNode.ts](src/main/nodes/LLMAgentNode.ts)
- [src/main/nodes/IFrameNode.ts](src/main/nodes/IFrameNode.ts)
- [src/Jitsi.ts](src/Jitsi.ts)

### New frontend files likely needed

- `src/main/services/activityLogger.ts`

### Acceptance criteria

- activity records include `userId`, `sessionId`, event type, payload, and timestamp
- activity logging survives reloads because storage is server-backed
- the in-memory conversation window remains a UI cache, not the only data source

Status: completed for core activity capture; conversation history replay is still a follow-up improvement

## Phase 6: Replace External Python Agent Endpoints

### Goal

Route all AI-controlled character interactions through the backend service.

### Backend work

- implement `POST /api/agents/:agentId/chat`
- add provider abstraction for OpenAI, Azure OpenAI, Anthropic, and Ollama later
- keep provider credentials server-side only
- build agent context from persisted dialogue and recent activities

### Frontend work

- replace [src/main/services/demoLLMBridge.ts](src/main/services/demoLLMBridge.ts) with a backend API bridge
- simplify [src/main/services/LLMAgentService.ts](src/main/services/LLMAgentService.ts) so it targets internal app APIs instead of per-agent localhost URLs
- refactor [src/main/agents/AgentDefinition.ts](src/main/agents/AgentDefinition.ts) away from `agentUrl`

### Agent context inputs

- default agent prompt
- recent conversation history
- recent activity records
- user profile facts
- optional user-owned character system prompt when that character is AI-controlled offline

### Acceptance criteria

- no separate Python service is required to talk to an agent
- one backend API call is sufficient for all in-scene agents
- frontend no longer hardcodes localhost agent endpoints

Status: completed for the shared backend chat path; provider coverage is still intentionally minimal

## Phase 7: Character Prompt Management

### Goal

Keep AI-character behavior unified while reserving editable prompt configuration for a user's own AI-controlled character.

### Backend work

- persist the user's own character system prompt in profile or character storage
- keep teacher and student AI characters on the same backend orchestration path
- avoid teacher-only chat configuration APIs

### Frontend work

- add character settings UI for the user's own AI-controlled character
- keep the conversation UI shared across teacher and student AI characters
- avoid teacher-only prompt editing affordances

### Existing frontend files likely to change

- [src/main/nodes/LLMAgentNode.ts](src/main/nodes/LLMAgentNode.ts)
- [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts)

### New frontend files likely needed

- `src/main/ui/CharacterSettingsWindow.ts`

### Acceptance criteria

- users can save the system prompt for their own AI-controlled character
- teacher and student AI characters share the same implementation and conversation UI
- prompt updates are recorded in activity history only for the user's own character prompt

Status: in progress as part of the product cleanup that removes teacher-only prompt editing

## Phase 8: Deployment And Hosting Cleanup

### Goal

Make the repo understandable and hostable as an open-source project.

### Work items

- rename project references from THUShundeBuilding.AI to ThisIsMyDepartment.AI where appropriate
- document supported auth handoff adapters
- document environment variables for backend provider integration
- add hosting examples for browser and Electron deployments
- decide whether the upstream socket multiplayer dependency remains or is internalized

### Docs to update

- [README.md](README.md)
- [AGENTS.md](AGENTS.md)
- new `doc/hosting.md`
- new `doc/auth-adapters.md`

### Acceptance criteria

- a new contributor can understand the architecture without reading the old code first
- a host can configure login integration and LLM provider settings from documentation

Status: in progress; the main README, auth integration guide, and hosting guide now exist, but deeper release cleanup is still ongoing

## Recommended First Coding Milestone

The first actual code milestone should be:

1. add `shared/` contracts
2. scaffold `server/` with `GET /api/bootstrap`
3. refactor frontend startup to block on bootstrap
4. stop using Guest and free-text username as identity

This milestone was completed and unblocked the later phases above.

## Risk Register

### Risk 1: Identity split across socket, Jitsi, and frontend state

Mitigation:

- define one canonical `userId`
- treat display name as presentation only
- explicitly map Jitsi participant IDs to app users in session state

### Risk 2: Frontend-only assumptions blocking backend integration

Mitigation:

- introduce a bootstrap service first
- avoid direct state initialization in the frontend app runtime that bypasses backend data

### Risk 3: Replacing agent URLs too early

Mitigation:

- keep existing LLM abstraction
- swap the bridge only after backend chat API exists

### Risk 4: Over-scoping the first backend

Mitigation:

- begin with in-memory adapters
- add persistence engines behind interfaces
- postpone admin tools until end-user flows work

## Suggested Execution Order For PRs

1. shared contracts
2. backend scaffold and local bootstrap API
3. frontend bootstrap integration
4. avatar onboarding refactor
5. activity logging API plus frontend emitter
6. backend-driven agent chat
7. character prompt UI and storage
8. docs and rename cleanup

Current focus: item 8 and follow-on polish tasks for open-source publication, including documenting the now-integrated realtime server deployment path.

## Definition Of Success

This repo reaches the intended platform direction when all of the following are true:

- users arrive with a verified identity from an upstream auth source
- the app uses a stable `userId` everywhere important
- first-time users are required to choose an avatar and that choice persists
- conversations and iframe usage are recorded against user and session records
- AI-controlled characters work without separate Python sidecar processes
- users can edit their own AI-character prompt safely
- the project is documented well enough for a third party to self-host it
