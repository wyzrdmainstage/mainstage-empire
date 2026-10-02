# Railway deployment configuration

Score uses `.railway/railway.ts`, applied to production on October 2, 2026.
The old `railway.json` has been removed. See [.railway/README.md](.railway/README.md).

Use Node 24 and `npm ci`. Keep the pinned prerelease Prisma packages unchanged.
Configuration changes require a reviewed `railway config plan` followed by
`railway config apply`; committing the file alone does not apply settings.

The app uses the existing private PostgreSQL connection. Preserve variable
values on Railway; never copy credentials into Git. The health check confirms
HTTP readiness; it does not verify database or email delivery.
