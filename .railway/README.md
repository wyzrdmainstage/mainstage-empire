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

## Future changes

Install the pinned railway SDK with npm ci. CLI 5.63.1 was used. On Windows,
place the native railway.exe directory on PATH for the SDK's version check.
Run `railway config plan --file .railway/railway.ts --json`, review changes,
then `railway config apply --file .railway/railway.ts --yes`.
Never use --decrypt-variables or --show-values for routine configuration work.
Add newly introduced variable names with preserve() before subsequent applies.
Do not change the partial name or broaden ownership to the database.

migration-preview.json is the original pre-migration audit, not a current plan.
