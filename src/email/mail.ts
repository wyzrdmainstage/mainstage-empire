import nodemailer from "nodemailer";
import {
  buildLoginEmail,
  buildJudgeInvitationEmail,
} from "./login-email";

function getMailer() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !smtpFrom) {
    throw new Error("SMTP environment variables are not fully configured.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  return { transporter, smtpFrom };
}

export async function sendTestEmail(to: string) {
  const { transporter, smtpFrom } = getMailer();
  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: "Mainstage Score — Email Test",
    text: "This is a test email from Mainstage Score using Fastmail SMTP.",
    html: `
      <div style="font-family: Arial, sans-serif; background:#000; color:#fff; padding:40px;">
        <h1 style="color:#f5b942;">Mainstage Empire</h1>
        <h2>Mainstage Score</h2>
        <p>This is a test email from Mainstage Score using Fastmail SMTP.</p>
      </div>
    `,
  });
}

export async function sendLoginEmail(
  to: string,
  loginUrl: string
) {
  const { transporter, smtpFrom } = getMailer();
  const emailContent = buildLoginEmail(loginUrl);

  return transporter.sendMail({
    from: smtpFrom,
    to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}

export async function sendJudgeInvitationEmail(
  to: string,
  invitationUrl: string,
  competitionName: string
) {
  const { transporter, smtpFrom } = getMailer();
  const emailContent = buildJudgeInvitationEmail(
    invitationUrl,
    competitionName
  );

  return transporter.sendMail({
    from: smtpFrom,
    to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}
