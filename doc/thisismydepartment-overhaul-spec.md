# ThisIsMyDepartment.AI Overhaul Spec

## Purpose

This document defines the target architecture for turning the current codebase into the open-source, self-hostable platform named ThisIsMyDepartment.AI.

The current repository already contains a usable virtual environment client, character rendering, multiplayer synchronization, Jitsi integration, and a basic LLM agent abstraction. What it does not yet contain is the server-side foundation required for stable identity, persistent user profiles, activity recording, and safe LLM provider integration.

This spec is the target for the cleanup and overhaul work.

The concrete execution order for this repo is documented in [doc/implementation-plan.md](doc/implementation-plan.md).

## Product Goals

1. Support easy self-hosting by departments, labs, companies, and schools.
2. Accept identity from an upstream website that already completed login.
3. Give every user a stable unique ID inside the platform.
4. Show avatar customization for first-time users and persist the result.
5. Record user activities and conversations under that stable user ID.
6. Replace separate Python agent processes with built-in LLM provider integration.
7. Allow users to edit the system prompt for their own character when that character is AI-controlled offline.

## Current State

Status note: this section summarizes the original baseline that motivated the overhaul. Many items below are now resolved in the live repository and are kept here to explain the architectural direction of the spec.

### Frontend runtime

- Main game bootstrap is now routed through [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts).
- The original client auto-started with a Guest user instead of authenticating a real user.
- Character selection UI existed in [src/main/scenes/TitleScene.ts](src/main/scenes/TitleScene.ts), but it was not yet wired into a real profile flow.

### Identity model

- Socket multiplayer originally keyed users by a plain username string in [src/engine/online/OnlineService.ts](src/engine/online/OnlineService.ts).
- Jitsi provides a session-scoped participant ID, not a platform user identity.
- There was no canonical app-level user object.

### Avatar state

- Avatar sprites are loaded in [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts).
- Sprite changes work in [src/main/nodes/PlayerNode.ts](src/main/nodes/PlayerNode.ts).
- Avatar choice was not persisted across sessions.

### Activity tracking

- Conversation UI and in-memory logs exist in [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts).
- Agent-side history is cached in memory in [src/main/nodes/LLMAgentNode.ts](src/main/nodes/LLMAgentNode.ts).
- No database or API persisted user events in the original baseline.

### LLM integration

- Agent abstraction is already centralized in [src/main/services/LLMAgentService.ts](src/main/services/LLMAgentService.ts).
- The original wiring posted to external agent URLs via [src/main/services/demoLLMBridge.ts](src/main/services/demoLLMBridge.ts).
- The original agent definitions encoded external URLs in [src/main/agents/AgentDefinition.ts](src/main/agents/AgentDefinition.ts).

## Core Architectural Decision

This project should become a two-part system:

1. A frontend virtual-environment client.
2. A lightweight backend that owns identity, persistence, and LLM orchestration.

This is required because both of the following need trusted server-side logic:

- upstream identity handoff and session establishment
- LLM provider access with secrets, rate limiting, and retrieval of stored user context

## Target Architecture

### Frontend responsibilities

- Render the world, UI, player, NPCs, and AI-controlled characters.
- Fetch authenticated user bootstrap data before entering the game.
- Show avatar onboarding if the authenticated user has no saved profile.
- Emit structured activity events to the backend.
- Display conversation history and agent interactions.
- Request AI replies through the backend API rather than direct browser-to-provider calls.

### Backend responsibilities

- Verify incoming login handoff payloads.
- Normalize external identity into a stable internal user record.
- Create and validate sessions.
- Store user profile, avatar, prompt preferences, and activity history.
- Build LLM context from stored activities and prior dialogue.
- Call the configured LLM provider.
- Return replies and updated conversation records to the frontend.

## Authentication And Identity

### Required capability

The platform must support deployments where authentication is handled elsewhere and the user is forwarded into ThisIsMyDepartment.AI with trusted identity information.

### Recommended generic pattern

Use a backend handoff endpoint plus pluggable verifier adapters.

Flow:

1. Upstream site authenticates the user.
2. Upstream site sends a signed handoff payload to ThisIsMyDepartment.AI backend.
3. Backend verifies the payload with a deployment-specific adapter.
4. Backend creates or updates the user record.
5. Backend creates an app session and returns a session cookie or token.
6. Frontend calls a bootstrap endpoint to get the current user and profile.

### Supported handoff modes

The open-source release should support these modes behind one normalized interface:

- signed POST form handoff
- JWT handoff
- reverse-proxy authenticated headers
- iframe or popup `postMessage` handoff for embedded deployments

### Why not raw POST directly into the frontend

- Browser-only code cannot safely verify many institution-specific payloads.
- Initial POST navigation data is not a good long-term session model.
- The same user identity must be reused by persistence and LLM context retrieval.

### Normalized user model

Every authenticated user should be normalized into this shape:

```ts
interface DepartmentUser {
    userId: string;
    externalId?: string;
    displayName: string;
    email?: string;
    organization?: string;
    department?: string;
    roles: string[];
    avatar?: {
        spriteIndex: number;
        updatedAt: string;
    };
}
```

The stable primary key is `userId`. The client should never treat a mutable display name as the canonical identity.

## User Flow

### Bootstrap flow

1. Frontend starts.
2. Frontend calls `GET /api/bootstrap`.
3. Backend returns:
   - authenticated user
   - current session info
   - avatar/profile state
   - configured agents visible in the scene
   - room configuration if needed
4. If user is not authenticated, frontend redirects to a login handoff page or a local fallback login page.
5. If user is authenticated but has no avatar/profile, frontend opens first-time onboarding.
6. Otherwise frontend enters the game directly.

### First-time onboarding flow

Use the existing character picker logic as the basis, but turn it into a profile setup step instead of an anonymous join screen.

Flow:

1. User arrives with authenticated identity.
2. Frontend loads profile.
3. If no saved avatar exists, show avatar setup modal or onboarding scene.
4. Save selected avatar through `PUT /api/me/profile`.
5. Enter the game with that saved avatar.

The existing code in [src/main/scenes/TitleScene.ts](src/main/scenes/TitleScene.ts) should be reused, but the free-text username field should no longer define identity.

## Persistence Model

### Minimum entities

The backend should store at least these entities:

- users
- sessions
- profiles
- activities
- conversations
- conversation_messages
- character prompt settings

### Suggested data model

```ts
interface UserRecord {
    userId: string;
    externalProvider?: string;
    externalId?: string;
    displayName: string;
    email?: string;
    createdAt: string;
    updatedAt: string;
}

interface UserProfileRecord {
    userId: string;
    spriteIndex: number;
    preferences: Record<string, unknown>;
    updatedAt: string;
}

interface SessionRecord {
    sessionId: string;
    userId: string;
    startedAt: string;
    endedAt?: string;
    clientType: "web" | "electron";
}

interface ActivityRecord {
    activityId: string;
    userId: string;
    sessionId: string;
    type: string;
    actorId: string;
    targetId?: string;
    payload: Record<string, unknown>;
    createdAt: string;
}
```

### Activity types

The initial event taxonomy should cover:

- `player_chat_sent`
- `player_chat_received`
- `agent_chat_sent`
- `agent_chat_received`
- `iframe_opened`
- `iframe_closed`
- `iframe_url_changed`
- `presentation_started`
- `presentation_viewed`
- `room_joined`
- `room_left`
- `avatar_updated`
- `character_prompt_updated`

Each event should be append-only. Avoid trying to encode all state in one mutable row.

## AI Agent Architecture

### Design goal

The app should not depend on one Python service per agent. Instead, the backend should expose one chat API and internally route requests to configured providers.

### Replace `agentUrl` with provider-oriented config

Current agent definitions should move away from endpoint URLs and toward logical provider config.

Suggested direction:

```ts
interface AgentRuntimeDefinition {
    agentId: string;
    displayName: string;
    spriteIndex: number;
    position: { x: number; y: number };
    caption?: string;
    defaultSystemPrompt?: string;
    provider: "openai" | "anthropic" | "ollama" | "azure-openai";
    model: string;
    walkArea?: { x: number; y: number; width: number; height: number };
}
```

### Backend chat API

Suggested request:

```ts
interface ChatRequest {
    agentId: string;
    message: string;
    sessionId?: string;
}
```

Suggested response:

```ts
interface ChatResponse {
    reply: string;
    conversationId: string;
    messageId: string;
    metadata?: Record<string, unknown>;
}
```

The frontend should no longer be responsible for constructing full durable history. It may still keep a local UI cache, but the backend should own the persisted conversation state.

### Agent context construction

Before calling the provider, the backend should compose context from:

- agent default system prompt
- recent conversation messages
- recent user activities
- selected user profile facts
- the user's own character system prompt when that character is AI-controlled offline
- optional deployment-specific institution context

Context should be built server-side so it can safely use stored data.

## User-Editable Character System Prompt

### Requirement

Users should be able to edit the system prompt for their own character when that character is AI-controlled offline.

### Behavior

- Each AI-controlled character has a default prompt owned by the deployment or by the character record.
- A user's own character may additionally carry a user-owned character system prompt.
- Teacher and student AI-controlled characters should use the same backend orchestration and conversation UI.
- Teacher characters differ only by being placed in the environment by default in the shipped deployment.

### UI capability

The frontend should expose character settings for the user's own AI-controlled character rather than a teacher-only agent prompt editor.

### Persistence

The user-owned character prompt should be stored on the user's profile or character record.

## Frontend Refactor Targets

### Replace anonymous bootstrap

Refactor [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts) so startup depends on authenticated bootstrap data rather than hardcoded Guest defaults.

### Rework the title scene

Refactor [src/main/scenes/TitleScene.ts](src/main/scenes/TitleScene.ts) into one of these:

- a first-time profile setup scene
- an avatar edit scene reachable from settings

The username field should become read-only display or be removed from the profile-defining path.

### Replace in-memory source of truth

Conversation state in [src/main/ThisIsMyDepartmentApp.ts](src/main/ThisIsMyDepartmentApp.ts) and [src/main/nodes/LLMAgentNode.ts](src/main/nodes/LLMAgentNode.ts) should become a UI cache backed by persisted server data.

### Track iframe activity

[src/main/nodes/IFrameNode.ts](src/main/nodes/IFrameNode.ts) should emit structured activity events when a frame is opened, closed, or changed.

## Backend API Surface

### Bootstrap and profile

- `GET /api/bootstrap`
- `GET /api/me`
- `PUT /api/me/profile`
- `GET /api/me/activities`

### Authentication

- `POST /auth/handoff`
- `POST /auth/logout`
- optional `GET /auth/status`

### Agent interaction

- `POST /api/agents/:agentId/chat`
- `GET /api/agents`

### Activity ingestion

- `POST /api/activities`

The activity ingestion API may later be batched, but the first implementation should prefer clarity over premature optimization.

## Suggested Delivery Phases

### Phase 1: Identity foundation

- add backend project
- implement normalized user model
- implement `POST /auth/handoff`
- implement `GET /api/bootstrap`
- stop using display name as canonical player identity

### Phase 2: Profile and onboarding

- restore avatar setup using existing character picker
- persist sprite selection by user ID
- allow returning users to skip onboarding

### Phase 3: Activity persistence

- define activity taxonomy
- add backend storage and ingestion endpoint
- emit events for chats and iframe actions
- add basic activity viewer for debugging and admin use

### Phase 4: Built-in LLM orchestration

- remove dependency on per-agent external URLs
- add provider abstraction in backend
- route all agent chat through backend
- include persisted activities and stored conversation context

### Phase 5: Character prompt editing and polish

- add user-owned character prompt UI
- add reset and validation behavior
- update docs and example deployment adapters

## Open Questions

1. Should the open-source release target browser deployment first, Electron first, or both equally?
2. Should activity history be visible only to the user, or also to admins and teachers?
3. Should character prompt settings remain private to the user, or should there also be shared course or room-level defaults?
4. Should multiplayer identity in the scene show `displayName` only, or include role/title metadata?
5. Which provider set should be supported in the first release: OpenAI only, or also Ollama and Azure OpenAI?

## Immediate Repo Consequences

The next implementation stage should not start by patching isolated frontend files. It should start by defining the backend package, API contracts, and frontend bootstrap flow, because the current frontend cannot satisfy the identity and persistence requirements on its own.

That means the next practical work items are:

1. scaffold a backend service inside this repository
2. define shared TypeScript types for bootstrap, user, profile, activity, and agent chat
3. refactor frontend startup to depend on `GET /api/bootstrap`
4. convert the existing character picker into a first-time profile setup flow
