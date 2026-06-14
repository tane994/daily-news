// Reads prior snapshots from disk so the generator can: avoid repeating recent
// knowledge topics, review yesterday's lesson (spaced repetition), and build the
// weekly / monthly course recaps. Snapshots are the single source of truth.

import { readdirSync } from "fs";

const DIR = "public/data/snapshots";

export function listDates(): string[] {
  try {
    return readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch { return []; }
}

export async function readSnapshot(ymd: string): Promise<any | null> {
  try { return await Bun.file(`${DIR}/${ymd}.json`).json(); } catch { return null; }
}

// ── date math on YYYY-MM-DD (noon-UTC anchor avoids tz/DST edge cases) ──
const at = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
export const dow = (ymd: string): number => at(ymd).getUTCDay(); // 0=Sun … 6=Sat
export function addDays(ymd: string, delta: number): string {
  const d = at(ymd); d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function isLastOfMonth(ymd: string): boolean {
  const d = at(ymd); const next = new Date(d.getTime() + 86400000);
  return next.getUTCMonth() !== d.getUTCMonth();
}
/** Monday of the week containing `ymd` (week = Mon–Sun). */
export function mondayOf(ymd: string): string {
  const day = dow(ymd); const back = day === 0 ? 6 : day - 1;
  return addDays(ymd, -back);
}
export const firstOfMonth = (ymd: string) => `${ymd.slice(0, 7)}-01`;

/** The N most recent existing snapshots strictly before `beforeYmd`, newest first. */
export async function recentSnaps(beforeYmd: string, n: number): Promise<{ ymd: string; snap: any }[]> {
  const dates = listDates().filter((d) => d < beforeYmd).sort().reverse().slice(0, n);
  const out: { ymd: string; snap: any }[] = [];
  for (const d of dates) { const s = await readSnapshot(d); if (s) out.push({ ymd: d, snap: s }); }
  return out;
}

/** Recently-used knowledge titles, grouped by categoryId (for no-repeat). */
export async function coveredKnowledge(beforeYmd: string, days: number): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  for (const { snap } of await recentSnaps(beforeYmd, days))
    for (const it of (snap.knowledge?.items ?? []))
      (map[it.categoryId] ??= []).push(it.title);
  return map;
}

/** Titles of past lessons for one course (newest first), to continue the curriculum. */
export async function courseCovered(beforeYmd: string, courseId: string, days: number): Promise<string[]> {
  const out: string[] = [];
  for (const { snap } of await recentSnaps(beforeYmd, days)) {
    const c = (snap.courses ?? []).find((x: any) => x.id === courseId);
    if (c?.lesson?.title) out.push(c.lesson.title);
  }
  return out;
}

/** Yesterday's lesson object for a course, if it was a normal lesson (for the review). */
export async function yesterdayLesson(ymd: string, courseId: string): Promise<any | null> {
  const snap = await readSnapshot(addDays(ymd, -1));
  const c = (snap?.courses ?? []).find((x: any) => x.id === courseId);
  return c?.lesson && c.lesson.kind === "lesson" ? c.lesson : null;
}

/** Course lessons whose date is in [fromYmd, toYmd] inclusive, oldest first (for recaps). */
export async function lessonsInRange(courseId: string, fromYmd: string, toYmd: string): Promise<any[]> {
  const out: any[] = [];
  for (const d of listDates().filter((x) => x >= fromYmd && x <= toYmd)) {
    const snap = await readSnapshot(d);
    const c = (snap?.courses ?? []).find((x: any) => x.id === courseId);
    if (c?.lesson && c.lesson.kind === "lesson") out.push(c.lesson);
  }
  return out;
}
