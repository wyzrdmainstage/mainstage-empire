import { sendEmail } from "./transport";
import {
  buildLoginEmail,
  buildJudgeInvitationEmail,
} from "./login-email";

export async function sendTestEmail(to: string) {
  await sendEmail({
    to,
    subject: "Mainstage Score — Email Test",
    text: "This is a test email from Mainstage Score.",
    html: `
      <div style="font-family: Arial, sans-serif; background:#000; color:#fff; padding:40px;">
        <h1 style="color:#f5b942;">Mainstage Empire</h1>
        <h2>Mainstage Score</h2>
        <p>This is a test email from Mainstage Score.</p>
      </div>
    `,
  });
}

export async function sendLoginEmail(
  to: string,
  loginUrl: string
) {
  const emailContent = buildLoginEmail(loginUrl);

  return sendEmail({
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
  const emailContent = buildJudgeInvitationEmail(
    invitationUrl,
    competitionName
  );

  return sendEmail({
    to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}
