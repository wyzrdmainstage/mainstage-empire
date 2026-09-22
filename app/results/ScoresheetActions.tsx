import Link from "next/link";
import ShareResultsButton from "./ShareResultsButton";

export default function ScoresheetActions({ competitionId, performerId, artistName }: {
  competitionId: number;
  performerId: number;
  artistName: string;
}) {
  const href = `/results/${competitionId}/performers/${performerId}`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Link href={href} className="text-sm font-semibold text-amber-400 hover:text-amber-300">
        View Scoresheet
      </Link>
      <ShareResultsButton href={href} label="Share Scoresheet" title={`${artistName} — Mainstage Empire Scoresheet`} />
    </div>
  );
}
