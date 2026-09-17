export function buildLoginEmail(loginUrl: string) {
  return {
    subject: "Your Mainstage Score Login",
    text: `Sign in to Mainstage Score:

${loginUrl}

This login link expires in 24 hours and can only be used once.

Mainstage Empire`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Mainstage Score Login</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family:Arial,Helvetica,sans-serif; color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#111111; border:1px solid #292929; border-radius:16px; overflow:hidden;">

          <tr>
            <td align="center" style="padding:36px 30px 20px;">
              <div style="font-size:14px; font-weight:bold; letter-spacing:4px; color:#f5b942;">
                MAINSTAGE EMPIRE
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 40px 40px;">
              <h1 style="margin:0 0 16px; font-size:28px; line-height:1.2; color:#ffffff;">
                Your Mainstage Score Login
              </h1>

              <p style="margin:0 0 24px; font-size:16px; line-height:1.6; color:#b3b3b3;">
                You've requested access to Mainstage Score.
                Click the button below to sign in.
              </p>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px; background:#f5b942;">
                    <a
                      href="${loginUrl}"
                      style="display:inline-block; padding:14px 24px; font-size:16px; font-weight:bold; color:#000000; text-decoration:none;"
                    >
                      SIGN IN TO MAINSTAGE SCORE
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:#777777;">
                This login link expires in 24 hours and can only be used once.
              </p>

              <p style="margin:20px 0 0; font-size:13px; line-height:1.6; color:#777777;">
                If you didn't request this login link, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #292929; padding:22px 30px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#666666;">
                Mainstage Empire
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
  };
}

export function buildJudgeInvitationEmail(
  invitationUrl: string,
  competitionName: string
) {
  return {
    subject: `You're Invited to Judge — ${competitionName}`,
    text: `You've been invited to judge for ${competitionName} using Mainstage Score.

Competition:
${competitionName}

Click the link below to access Mainstage Score and accept your judge assignment:

${invitationUrl}

This invitation expires in 24 hours.

Mainstage Empire`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're Invited to Judge</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family:Arial,Helvetica,sans-serif; color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#111111; border:1px solid #292929; border-radius:16px; overflow:hidden;">

          <tr>
            <td align="center" style="padding:36px 30px 20px;">
              <div style="font-size:14px; font-weight:bold; letter-spacing:4px; color:#f5b942;">
                MAINSTAGE EMPIRE
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 40px 40px;">
              <h1 style="margin:0 0 16px; font-size:28px; line-height:1.2; color:#ffffff;">
                You're Invited to Judge
              </h1>

              <p style="margin:0 0 24px; font-size:16px; line-height:1.6; color:#b3b3b3;">
                You've been invited to serve as a judge for the following
                Mainstage Empire competition:
              </p>

              <div style="margin:0 0 28px; padding:18px; border:1px solid #292929; border-radius:10px; background:#0a0a0a;">
                <p style="margin:0; font-size:13px; text-transform:uppercase; letter-spacing:2px; color:#777777;">
                  Competition
                </p>

                <p style="margin:8px 0 0; font-size:20px; font-weight:bold; color:#f5b942;">
                  ${competitionName}
                </p>
              </div>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px; background:#f5b942;">
                    <a
                      href="${invitationUrl}"
                      style="display:inline-block; padding:14px 24px; font-size:16px; font-weight:bold; color:#000000; text-decoration:none;"
                    >
                      ACCESS MAINSTAGE SCORE
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:#777777;">
                This invitation expires in 24 hours.
              </p>

              <p style="margin:20px 0 0; font-size:13px; line-height:1.6; color:#777777;">
                Mainstage Score uses passwordless authentication.
                You will not need to create or remember a password.
              </p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #292929; padding:22px 30px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#666666;">
                Mainstage Empire
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
  };
}