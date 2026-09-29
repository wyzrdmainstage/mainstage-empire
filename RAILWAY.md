# Score migration to Railway

Deploy this repository as a separate Node 24 service. Use the committed lockfile
with npm ci; do not upgrade the prerelease Prisma packages during migration.
railway.json supplies the build/start commands and an HTTP readiness check.
The readiness check confirms the app is running; it does not verify database or email access.

Set DATABASE_URL to the copied Railway PostgreSQL database's private connection URL.
Set RESEND_API_KEY and RESEND_FROM (an address on your verified Resend domain)
for HTTPS email delivery on Railway. All login and invitation paths share this
sender. API failures are reported without falling back to SMTP. Without a Resend
key, the existing server can still use SMTP_HOST, SMTP_PORT, SMTP_USER,
SMTP_PASSWORD, and SMTP_FROM. Railway requires Pro or above for outbound SMTP.
Missing email settings fail email requests, not module imports.
Set NEXT_PUBLIC_APP_URL before building to the HTTPS test address; change it to
https://score.mainstageempire.com and rebuild for cutover. Do not paste credentials
into Git, logs, or chat.

Use PostgreSQL 17 initially. Restore a full pg_dump archive, including all schemas,
sequence values, and migration metadata, with ownership/ACL restoration disabled.
Do not initialize or seed over the restored database. Test restores on an empty
database and verify table counts and login, invitations, scoring, feedback,
tiebreaks, and public results before cutover. Enable database backups.

The current server stays live during preparation. For cutover, pause writes,
take and restore a final dump, verify it, then change only the score subdomain.
Keep the old server available. Once Railway accepts writes, switching back needs
data reconciliation; the old database is no longer current.
