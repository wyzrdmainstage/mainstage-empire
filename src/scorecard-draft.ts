export const scoreFields = ["presentation", "vocals", "lyrics", "energy", "quality", "starFactor"] as const;
export type Scores = Record<(typeof scoreFields)[number], number | null>;
export type ScorecardDraft = { scores: Scores; notes: string; savedAt: number };

// Separate each judge assignment, performer, and existing server revision.
export function draftKey(assignmentId: number, performerId: number, revision: string) {
  return `score:draft:v1:${assignmentId}:${performerId}:${revision}`;
}

export function writeDraft(storage: Pick<Storage, "setItem">, key: string, scores: Scores, notes: string) {
  storage.setItem(key, JSON.stringify({ scores, notes, savedAt: Date.now() }));
}

export function readDraft(raw: string | null, now = Date.now()): ScorecardDraft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || typeof draft.savedAt !== "number" || !Number.isFinite(draft.savedAt) ||
        draft.savedAt > now || now - draft.savedAt > 24 * 60 * 60 * 1000 ||
        typeof draft.notes !== "string" || !draft.scores ||
        !scoreFields.every((field) => draft.scores[field] === null ||
          (Number.isInteger(draft.scores[field]) && draft.scores[field] >= 1 && draft.scores[field] <= 10))) {
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}
