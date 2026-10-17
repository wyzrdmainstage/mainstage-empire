# Score Railway configuration

Applied to production October 2, 2026. Legacy railway.json removed.

The named partial `mainstage-score` owns only the app service. PostgreSQL and
its volume remain outside its ownership. Nine app variable values are preserved.
Project: 3ce785f4-3392-461b-94d3-624069afecbc.
Environment: 30689fa0-1329-4eb0-8f79-6ee6336f4e6f.

Settings: RAILPACK; build `npm run build`; start
`npm run start -- --hostname 0.0.0.0`; health `/api/health`, timeout 120 seconds.
No custom legacy config path was configured.

## Restart-policy limitation

The IaC backend reported success but dropped explicit restartPolicyType and
restartPolicyMaxRetries on two applies. Those fields are omitted to avoid
perpetual plan drift. Railway's documented default matches the previous policy:
ON_FAILURE with 10 retries. Verify effective deployment settings after release.
See https://docs.railway.com/deployments/restart-policy.

## Production verification — October 17, 2026

Verified in Railway's production dashboard for service `mainstage-score`
(`7f899be2-93d6-4125-83ec-371f1616f967`).
Project: `3ce785f4-3392-461b-94d3-624069afecbc`.
Environment: production (`30689fa0-1329-4eb0-8f79-6ee6336f4e6f`).

The successful active deployment
[`09cd03bd-1284-42e6-b5e7-a6cce2c5be9d`](https://railway.com/project/3ce785f4-3392-461b-94d3-624069afecbc/service/7f899be2-93d6-4125-83ec-371f1616f967?environmentId=30689fa0-1329-4eb0-8f79-6ee6336f4e6f&id=09cd03bd-1284-42e6-b5e7-a6cce2c5be9d#details)
was deployed via CLI, labeled `8798a69 Move organizer judge view above management panels`.
Its Details > Configuration showed restart policy `on failure` (`ON_FAILURE`)
and max retries `10`. The production service settings independently matched.

The deployment also showed Railpack, build `npm run build`, start
`npm run start -- --hostname 0.0.0.0`, health check `/api/health` with a
120-second timeout, and nine variables. Variable values were not inspected.

No production correction was needed or made. This verifies the effective
configuration; it was not a deliberate crash/retry test.
The earlier report of dropped fields describes the IaC round-trip observation,
not proof that the effective restart policy was lost.
[Railway CLI issue #1184](https://github.com/railwayapp/cli/issues/1184)
reports default-valued restart fields appearing as null in plans even while
the resolved service instance retains `ON_FAILURE` / `10`.

Keep the restart fields omitted while the planner limitation remains.
If a later effective deployment differs, correct only the production app's
restart policy and retry count through Railway's supported service settings,
then verify the resulting deployment configuration. Preserve the partial name,
environment-variable values, and database ownership boundary.

## Future changes

Install the pinned railway SDK with npm ci. CLI 5.63.1 was used. On Windows,
place the native railway.exe directory on PATH for the SDK's version check.
Run `railway config plan --file .railway/railway.ts --json`, review changes,
then `railway config apply --file .railway/railway.ts --yes`.
Never use --decrypt-variables or --show-values for routine configuration work.
Add newly introduced variable names with preserve() before subsequent applies.
Do not change the partial name or broaden ownership to the database.

migration-preview.json is the original pre-migration audit, not a current plan.
