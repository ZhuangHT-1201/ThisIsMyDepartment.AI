# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- renamed the active runtime and public-facing app surface to ThisIsMyDepartment.AI
- replaced the external Python chat bridge default with backend-routed agent chat
- introduced backend-managed identity handoff, session bootstrap, and stable user IDs
- restored persistent user profile, avatar onboarding, and activity logging flows
- added configurable self-hosting support for backend, socket, Jitsi, and auth integration paths

### Added

- lightweight backend service under `server/` for auth, profile, activity, prompt, and agent APIs
- SQLite-backed persistence for users, sessions, activities, conversations, and identity mappings
- auth integration documentation for shared-secret, JWT, reverse-proxy, and `postMessage` handoff modes
- hosting documentation for browser, backend, reverse-proxy, and Electron deployment paths

## [0.0.1] - 2021-05-07

Initial release
