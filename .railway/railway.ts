import { defineRailway, preserve, project, service } from "railway/iac";

// Own only the application service. Postgres and its volume remain unmanaged
// by this file. Keep this partial name stable after the first apply.
export const partial = "mainstage-score";

export default defineRailway(() => {
  const score = service("mainstage-score", {
    source: {
      type: "github",
      repo: "wyzrdmainstage/mainstage-empire",
      branch: "main",
    },
    // Preserve values on Railway; never copy credentials into this repository.
    // Add new variable names here before applying future configuration changes.
    env: {
      DATABASE_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM: preserve(),
      SMTP_FROM: preserve(),
      SMTP_HOST: preserve(),
      SMTP_PASSWORD: preserve(),
      SMTP_PORT: preserve(),
      SMTP_USER: preserve(),
    },
    build: {
      builder: "RAILPACK",
      buildCommand: "npm run build",
    },
    deploy: {
      startCommand: "npm run start -- --hostname 0.0.0.0",
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      // Railway's default is ON_FAILURE with 10 retries. The current IaC
      // backend drops explicit restart fields; verify effective deployment
      // settings after releases rather than retaining perpetual plan drift.
    },
  });

  return project("Mainstage Score", { resources: [score] });
});
