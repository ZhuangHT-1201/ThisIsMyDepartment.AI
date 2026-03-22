# ThisIsMyDepartment.AI Open-Source Release Checklist

This checklist captures the remaining work between the current overhaul state and a first public open-source release.

## Current validated baseline

- frontend TypeScript compilation passes
- backend TypeScript build passes
- backend startup was validated on Node `16.20.2`
- default backend health endpoint responds on `http://127.0.0.1:8787/health`
- backend production dependency audit is clean
- copyable runtime configuration templates exist for frontend local runtime and backend local or production deployment

## Release blockers

- decide and publish the canonical repository URL and maintainer/contact information
- confirm the production auth integration guidance against a real upstream deployment
- resolve or explicitly accept the remaining root production dependency findings in the legacy `socket.io-client` stack
- validate and document the integrated backend realtime room server deployment path used by browser clients

## Dependency and runtime follow-up

- review the root production audit findings affecting `socket.io-client`, `engine.io-client`, `socket.io-parser`, `ws`, and `parseuri`
- upgrade client and server together and validate protocol compatibility before changing the Socket.IO major version
- keep Node `16.20.2` as the validated legacy frontend toolchain until the webpack/electron stack is intentionally modernized

## Documentation follow-up

- replace placeholder clone/publish instructions with the final public repository URL
- publish a real security reporting channel in [SECURITY.md](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/SECURITY.md)
- keep [.env.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/.env.example), [server/.env.local.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.local.example), and [server/.env.production.example](/Users/li_chuanhao/Library/CloudStorage/SynologyDrive-MacBookSync/Projects/THUShundeBuilding.AI/server/.env.production.example) aligned with the real runtime surface as configuration evolves
- keep institution-specific login adapters outside the public repository and document only the normalized backend handoff contract

## Product and packaging follow-up

- finish the remaining historical cleanup in assets, demo text, and archived reference material that still reflects pre-release naming
- verify Electron packaging metadata, icons, and app naming on each target platform you plan to support
- decide whether the Electron shell is part of the first public release or deferred behind the browser-hosted deployment path

## Security and hosting follow-up

- set production cookie settings and TLS proxy expectations explicitly for the published deployment guide
- document minimum secret management expectations for auth handoff and LLM provider keys
- verify reverse-proxy header trust boundaries in a real deployment
- confirm `postMessage` origin allowlists for embedded login flows

## Nice-to-have before first tag

- add a top-level release architecture diagram
- add an end-to-end smoke test script for bootstrap, profile update, and agent chat
- add a compatibility note describing which parts of the original Gather-derived stack are still intentionally retained
