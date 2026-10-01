# Login email limits

The login endpoint sends at most one login link per account per minute and five
per rolling hour. Limits use existing `authToken` records, including used links,
and survive app restarts. Invitations do not count. No schema migration is needed.

A Postgres transaction locks the account row before checking usage and inserting
the new token, so app instances share the same allowance. The transaction commits
before sending email. Provider failures remove only the newly reserved token;
previous links remain usable and another request can retry.

Unknown addresses, suppressed requests, and accepted sends return the same public
message and status. Limits apply per account, not per venue Wi-Fi address. This
protects login email delivery; it is not a general HTTP traffic or DDoS limiter.
Token cleanup must retain login records for at least the rolling one-hour window.

Validation: `node --test src/login-token.test.cjs` covers the route, concurrency
ordering, failures, and real SQL window behavior using an isolated PGlite database.
PGlite does not test separate production connections or Prisma's runtime codecs.
