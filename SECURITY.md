# Security Policy

## Supported versions

Report issues against the current `master` / latest release. Older tags are not patched separately unless noted in a release.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems that could enable unauthorized access, secret theft, or remote code execution.

Prefer one of:

1. Open a **private** security advisory on the GitHub repository (Security → Advisories), or
2. Contact the maintainers via the email listed on the GitHub profile / org of the primary owner.

Include:

- Affected version / commit
- Impact (auth bypass, SSH key exposure, SSRF, etc.)
- Steps to reproduce (minimal)
- Whether a fix is already known

We aim to acknowledge reports within a few days and coordinate a fix before disclosure.

## Hardening notes for operators

- Always set `AUTH_SECRET`, dashboard credentials, `CRON_SECRET`, and `API_SECRET` in production.
- Keep the dashboard off the public internet or behind VPN / IP allowlist when possible.
- SSH keys and Coolify tokens are encrypted at rest with `AUTH_SECRET` — treat that secret like a master key.
- Cron and status APIs must use Bearer tokens; do not expose them without auth.
