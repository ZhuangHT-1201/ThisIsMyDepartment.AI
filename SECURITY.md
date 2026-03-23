# Security Policy

## Scope

ThisIsMyDepartment.AI is intended to be self-hosted. Security issues can affect both the application code and the way a deployment is configured, especially around authentication handoff, session cookies, reverse-proxy headers, and LLM provider credentials.

## Supported Versions

Security fixes are provided for the latest state of the default branch and the latest tagged release after this project is published.

Older forks or locally modified deployments may need to be patched manually by their maintainers.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Instead, report it privately to the project maintainer with:

- a description of the issue
- affected components or deployment mode
- reproduction steps or a proof of concept if available
- any suggested mitigation

Until a dedicated security contact is published for the public release, treat security-sensitive findings as private maintainer communication and do not disclose them publicly.

## Deployment Notes

When hosting ThisIsMyDepartment.AI:

- keep LLM provider API keys on the backend only
- set secure cookie settings in production and terminate TLS at the proxy or app edge
- restrict reverse-proxy auth headers so they can only be injected by trusted infrastructure
- set an explicit origin allowlist for the embedded `postMessage` auth bridge
- rotate any shared-secret or JWT signing secrets used for auth handoff

See [doc/auth-integration.md](doc/auth-integration.md) and [doc/hosting.md](doc/hosting.md) for deployment-specific details.
