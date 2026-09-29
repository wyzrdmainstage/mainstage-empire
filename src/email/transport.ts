import nodemailer from "nodemailer";

type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const from = process.env.RESEND_FROM;
    if (!from) throw new Error("RESEND_FROM is not configured.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, from, to: [message.to] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Resend email request failed (HTTP ${response.status}).`);
    return;
  }

  // Preserve delivery on the existing server until its migration is complete.
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !port || !user || !pass || !from) {
    throw new Error("SMTP environment variables are not fully configured.");
  }
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
  });
  await transport.sendMail({ ...message, from });
}
