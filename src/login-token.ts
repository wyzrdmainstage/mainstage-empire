import { db } from "@/src/prisma/db";
import { generateToken, hashToken } from "@/src/auth";

export const LOGIN_LINK_MESSAGE =
  "If that email is authorized, check your inbox for a login link. If you recently requested one, use that link or try again later.";

// Store the allowance in existing token records, so restarts and additional
// app instances cannot reset it. Used tokens count; invitations do not.
export async function reserveLoginToken(userId: number) {
  return db.transaction(async (tx) => {
    // Serialize the check and insert across processes, without holding a
    // database lock while contacting the email provider.
    await tx.execute(db.raw.sql`
      SELECT id FROM public."user" WHERE id = ${userId} FOR UPDATE
    `.affectedCount().build());

    const usage = tx.query(db.raw.sql`
      SELECT count(*)::integer AS total,
        count(*) FILTER (
          WHERE "createdAt" > clock_timestamp() - interval '1 minute'
        )::integer AS recent
      FROM public."authToken"
      WHERE "userId" = ${userId} AND type = 'LOGIN'
        AND "createdAt" > clock_timestamp() - interval '1 hour'
    `.returnsRow({ total: "pg/int4@1", recent: "pg/int4@1" }).build());

    for await (const row of usage) {
      if (row.recent > 0 || row.total >= 5) return null;
    }

    const token = generateToken();
    const record = await tx.orm.public.AuthToken.create({
      userId,
      type: "LOGIN",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    return { token, id: record.id };
  });
}
