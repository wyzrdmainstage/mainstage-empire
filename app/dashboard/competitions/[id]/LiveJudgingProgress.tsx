"use client";

import { useEffect, useState } from "react";
import type { JudgingProgress } from "@/src/judging-progress";

export default function LiveJudgingProgress({ competitionId }: { competitionId: number }) {
  const [progress, setProgress] = useState<JudgingProgress | null>(null);
  const [notice, setNotice] = useState("Loading judging progress…");

  useEffect(() => {
    let disposed = false;
    let stopped = false;
    let pending = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      if (disposed || stopped || pending || document.visibilityState === "hidden") return;
      clearTimeout(timer);
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch(`/api/competitions/${competitionId}/progress`, {
          cache: "no-store", signal: controller.signal,
        });
        if (disposed) return;
        if ([401, 403, 404].includes(response.status)) {
          stopped = true;
          setProgress(null);
          setNotice(response.status === 401 ? "Session expired. Sign in again to view progress."
            : response.status === 403 ? "Organizer access is no longer available."
            : "This competition is no longer available.");
          return;
        }
        if (!response.ok) throw new Error("Progress request failed");
        const data: JudgingProgress = await response.json();
        if (disposed) return;
        setProgress(data);
        setNotice(`Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}. Refreshes every 10 seconds.`);
      } catch {
        if (!disposed) setNotice("Updates paused — connection unavailable. Displayed counts may be out of date. Retrying automatically.");
      } finally {
        clearTimeout(timeout);
        pending = false;
        if (!disposed && !stopped) timer = setTimeout(refresh, 10000);
      }
    }

    const resume = () => { void refresh(); };
    void refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [competitionId]);

  const percent = progress && progress.expected > 0 ? Math.min(100, progress.submitted / progress.expected * 100) : 0;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">Judging Progress</h2>
      {progress && <>
        <p className="mt-2 text-2xl font-semibold text-white">{progress.submitted} / {progress.expected}</p>
        <p className="mt-2 text-sm text-zinc-400">Submitted scorecards</p>
        <div role="progressbar" aria-label="Submitted scorecards" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}
          className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
        </div>
        {progress.judges.length === 0 ? <p className="mt-4 text-sm text-zinc-400">No judges assigned yet.</p> : (
          <ul className="mt-5 space-y-3">
            {progress.judges.map((judge) => <li key={judge.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-sm">
              <span className="break-words text-zinc-200">{judge.name}</span>
              <span className={judge.excluded ? "text-zinc-500" : judge.remaining ? "text-amber-300" : "text-emerald-400"}>
                {judge.excluded ? "Excluded from totals" : `${judge.submitted} submitted · ${judge.remaining} remaining`}
              </span>
            </li>)}
          </ul>
        )}
      </>}
      <p role="status" className="mt-4 text-xs text-zinc-400">{notice}</p>
    </div>
  );
}
