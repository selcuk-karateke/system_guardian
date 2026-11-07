# Contributing

Thanks for helping improve System Guardian.

## Dev setup (Windows-friendly)

1. Copy `.env.example` → `.env.local`
2. Local PostgreSQL: create DB `system_guardian`, set `DATABASE_URL`
3. `npm install` → `npm run db:migrate` → `npm run db:seed` → `npm run dev`
4. Keep `CHECK_MODE=mock` unless you intentionally test live SSH

See [AGENTS.md](AGENTS.md) and [docs/SYSADMIN.md](docs/SYSADMIN.md).

## Guidelines

- Prefer one vertical slice over repo-wide rewrites.
- SSH / Coolify / Backup / Notify / Thresholds live in the DB (Settings UI) — do not re-introduce ENV fallbacks for those.
- After adding a check module or API route, run `npm run docs:check`.
- Do not commit `.env`, SSH keys, or secrets.
- Keep Coolify optional: checks that depend on Coolify must skip cleanly when not detected.

## Tests

```bash
npx tsx --test src/lib/checks/coolify.test.ts
npx tsx --test src/lib/monitor-profiles.test.ts
```

Add focused unit tests for pure check helpers when you change alert logic.

## Pull requests

- Describe the **why** and how to verify.
- Update docs (`README`, `docs/DEPLOY.md`, or module notes) when behavior changes for operators.
- Keep UI changes consistent with existing HUD patterns; avoid drive-by refactors.

## License

By contributing, you agree that your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
