"use client";

import { useState } from "react";

export default function ShareResultsButton() {
  const [status, setStatus] = useState<"idle" | "copied">("idle");

  async function handleShare() {
    const url = window.location.href;

    const isMobile =
      /Android|iPhone|iPad|iPod|Windows Phone/i.test(
        navigator.userAgent
      );

    if (isMobile && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Mainstage Empire Competition Results",
          url,
        });

        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");

      window.setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch {
      window.prompt("Copy this results link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center justify-center rounded-lg border border-amber-400/40 bg-amber-400/10 px-5 py-2.5 text-sm font-semibold text-amber-400 transition hover:border-amber-400/70 hover:bg-amber-400/15"
    >
      {status === "copied" ? "Link Copied!" : "Share Results"}
    </button>
  );
}
