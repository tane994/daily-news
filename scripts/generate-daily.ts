// The daily job. Builds one snapshot: core news sections (with strict cross-
// section dedup), the personal markets layer (indicators + holdings), the Calcio
// watchlist, and the knowledge-based "Orizzonti" lane. Writes today's snapshot +
// rebuilds the archive manifest. Driven by the Claude Code CLI (Max login).
// Run: bun run generate

import { readdirSync } from "fs";
import {
  researchTopic, researchEntity, researchIndicators,
  researchKnowledge, researchCourse,
  type TopicConfig, type IndicatorReading, type StreamConfig,
  type KnowledgeCategoryConfig, type CourseConfig,
} from "./lib/research.ts";
import {
  coveredKnowledge, courseCovered, yesterdayLesson, lessonsInRange,
  isLastOfMonth, dow, mondayOf, firstOfMonth, addDays,
} from "./lib/history.ts";

const cfg = await Bun.file("config/topics.json").json();
const tz: string = cfg.timezone ?? "Europe/Rome";
const model: string = cfg.model ?? "claude-opus-4-8";
const topics: TopicConfig[] = cfg.topics ?? [];

const now = new Date();
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
const dateLabel = new Intl.DateTimeFormat("en-GB", {
  timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
}).format(now);

console.log(`Generating ${ymd} · model ${model} · ${topics.length} categories\n`);

/** Run `fn` over `items` with at most `limit` in flight; preserves order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── Portfolio identity: names to exclude from the open news sections, and a
//    matcher to catch them post-hoc (the same companies are tracked in Le mie azioni).
const pfStreams: any[] = (cfg.portfolio?.clusters ?? []).flatMap((c: any) => c.streams ?? []);
const cleanName = (n: string) => n.replace(/\(.*/, "").trim();
const excludeNames: string[] = [...new Set(pfStreams.flatMap((s: any) => (s.names ?? []).map(cleanName)))];
const OPEN_PRIORITY = ["ai", "markets", "startups"]; // URL dedup keeps the higher-priority section

type StreamResearcher = (
  s: StreamConfig, dateLabel: string, model: string, windowHours: number, maxItems: number, sources?: string[],
) => Promise<any[]>;

async function buildWatchlist(block: any, research: StreamResearcher) {
  if (!block?.clusters?.length) return null;
  const windowHours: number = block.windowHours ?? 48;
  const maxItems: number = block.maxItemsPerStream ?? 3;
  const jobs = block.clusters.flatMap((c: any) => (c.streams ?? []).map((s: any) => ({ cluster: c, stream: s })));
  console.log(`→ ${block.name} … ${jobs.length} streams`);
  // Concurrency 3: several opus web-search calls at once can trip throttling.
  const results = await mapPool(jobs, 3, async ({ cluster, stream }: any) => {
    try {
      const items = (await research(stream, dateLabel, model, windowHours, maxItems, block.sources)).slice(0, maxItems);
      console.log(`   · ${stream.label}: ${items.length}`);
      return { clusterId: cluster.id, stream, items };
    } catch (e: any) {
      console.log(`   · ${stream.label}: FAILED (${e.message})`);
      return { clusterId: cluster.id, stream, items: [] };
    }
  });
  const clusters = block.clusters
    .map((c: any) => ({
      id: c.id, label: c.label,
      streams: results.filter((r) => r.clusterId === c.id && r.items.length > 0)
        .map((r) => ({ id: r.stream.id, label: r.stream.label, kind: r.stream.kind, names: r.stream.names, items: r.items })),
    }))
    .filter((c: any) => c.streams.length > 0);
  const tot = clusters.reduce((n: number, c: any) => n + c.streams.reduce((m: number, s: any) => m + s.items.length, 0), 0);
  console.log(`✓ ${block.name} — ${tot} stories across ${clusters.length} clusters`);
  return { name: block.name, clusters };
}

// ── 1. Core news sections ──
// Run the overlap-prone news lanes in priority order so a shared story is claimed
// once: AI keeps capability news, Markets keeps the money/deal stories, Startups
// gets what's left. Each section is told the headlines already taken by earlier
// sections and must not repeat them (semantic dedup, beyond the URL dedup below).
// Sports desks (calendar mode) don't overlap the news lanes — no cross-exclude.
const NEWS_PRIORITY = ["ai", "markets", "startups"];
const rank = (id: string) => { const i = NEWS_PRIORITY.indexOf(id); return i === -1 ? 99 : i; };
const ordered = [...topics].sort((a, b) => rank(a.id) - rank(b.id));

const byId = new Map<string, any>();
const covered: string[] = []; // headlines already taken by earlier news sections
for (const t of ordered) {
  process.stdout.write(`→ ${t.name} … `);
  try {
    // Keep holdings' stock news out of Markets/Startups (covered in Le mie azioni).
    const exclude = t.id === "markets" || t.id === "startups" ? excludeNames : undefined;
    const cross = t.mode === "calendar" ? undefined : covered.slice();
    const r = await researchTopic(t, dateLabel, model, exclude, cross);
    const items = r.items.slice(0, t.maxItems ?? 8);
    byId.set(t.id, { id: t.id, name: t.name, intro: r.intro, items });
    if (t.mode !== "calendar") covered.push(...items.map((it: any) => it.headline).filter(Boolean));
    console.log(`${items.length} stories`);
  } catch (e: any) {
    console.log(`FAILED (${e.message}) — keeping section empty`);
    byId.set(t.id, { id: t.id, name: t.name, intro: "", items: [] });
  }
}
// Re-assemble in config order for the UI.
const out: any[] = topics.map((t) => byId.get(t.id)).filter(Boolean);

// ── 2. Indicators (number + tone color + explicit alto/basso level) ──
const indicatorsCfg: any[] = cfg.indicators ?? [];
let indicators: any[] = [];
if (indicatorsCfg.length) {
  process.stdout.write(`→ indicators … `);
  try {
    const readings: IndicatorReading[] = await researchIndicators(
      indicatorsCfg.map((c) => ({ key: c.key, label: c.label })), dateLabel, model,
    );
    indicators = indicatorsCfg.map((c) => {
      const r = readings.find((x) => x.key === c.key);
      if (!r) return null;
      const n = parseFloat(String(r.value).replace(/[^0-9.\-]/g, ""));
      let tone: "hot" | "calm" | "neutral" = "neutral";
      if (!Number.isNaN(n)) {
        if (c.low != null && c.high != null) tone = n > c.high ? "hot" : n < c.low ? "calm" : "neutral";
        else if (c.mean != null) tone = n > c.mean * 1.15 ? "hot" : n < c.mean * 0.9 ? "calm" : "neutral";
      }
      const level = tone === "hot" ? "alto" : tone === "calm" ? "basso" : "nella norma";
      const arrow = tone === "hot" ? "↑" : tone === "calm" ? "↓" : "→";
      return { key: c.key, label: c.label, value: r.value, reference: c.reference, asOf: r.asOf, source: r.source, url: r.url, tone, level, arrow };
    }).filter(Boolean);
    console.log(`${indicators.length} values`);
  } catch (e: any) { console.log(`FAILED (${e.message})`); }
}

// ── 3. Portfolio (fixed beat, defined sources, bounded) ──
const portfolio = await buildWatchlist(cfg.portfolio, researchEntity);

// Whole-edition URL dedup: a story appears once. Holdings claim their URLs first,
// then AI > Markets > Startups (higher priority keeps it). Catches the same article
// surfacing in My Stocks and a generic section (the ASML / Mistral case).
const seenUrl = new Set<string>();
const claimUrls = (wl: any) => wl?.clusters?.forEach((c: any) => c.streams.forEach((s: any) => s.items.forEach((it: any) => it.url && seenUrl.add(it.url.trim()))));
claimUrls(portfolio);
let dropped = 0;
for (const id of OPEN_PRIORITY) {
  const sec = out.find((s) => s.id === id);
  if (!sec) continue;
  sec.items = sec.items.filter((it: any) => {
    const u = (it.url ?? "").trim();
    if (u && seenUrl.has(u)) { dropped++; return false; }
    if (u) seenUrl.add(u);
    return true;
  });
}
if (dropped) console.log(`  (dedup: removed ${dropped} duplicate-URL stories from AI/Markets/Startups)`);

// ── 4. Bites: one categorized micro-card per category (knowledge, no-repeat) ──
const kCfg = cfg.knowledge;
let knowledge: any = null;
if (kCfg?.categories?.length) {
  const cats: KnowledgeCategoryConfig[] = kCfg.categories;
  process.stdout.write(`→ ${kCfg.name ?? "Bites"} … ${cats.length} categories (knowledge) `);
  try {
    const coveredByCat = await coveredKnowledge(ymd, kCfg.noRepeatDays ?? 21);
    const items = await researchKnowledge(cats, dateLabel, model, coveredByCat);
    if (items.length) knowledge = { name: kCfg.name ?? "Bites", items };
    console.log(`${items.length} cards`);
  } catch (e: any) { console.log(`FAILED (${e.message})`); }
}

// ── 5. Courses: curriculum lessons + spaced repetition + weekly/monthly recap ──
const courseCfgs: CourseConfig[] = cfg.courses ?? [];
let courses: any[] = [];
if (courseCfgs.length) {
  const monthly = isLastOfMonth(ymd);
  const weekly = !monthly && dow(ymd) === 0; // Sunday = weekly recap (month-end wins)
  const kind: "lesson" | "weekly" | "monthly" = monthly ? "monthly" : weekly ? "weekly" : "lesson";
  console.log(`→ Courses (${kind}) … ${courseCfgs.length}`);
  courses = await mapPool(courseCfgs, 2, async (course) => {
    process.stdout.write(`   · ${course.label} … `);
    try {
      let opts: any = { kind };
      if (kind !== "lesson") {
        const from = kind === "monthly" ? firstOfMonth(ymd) : mondayOf(ymd);
        const lessons = await lessonsInRange(course.id, from, addDays(ymd, -1));
        if (lessons.length === 0) opts = { kind: "lesson" }; // no history → real lesson
        else opts.lessons = lessons;
      }
      if (opts.kind === "lesson") {
        opts.covered = await courseCovered(ymd, course.id, 45);
        opts.yesterday = await yesterdayLesson(ymd, course.id);
      }
      const lesson = await researchCourse(course, dateLabel, model, opts);
      console.log(`${lesson.kind}: "${lesson.title}"`);
      return { id: course.id, label: course.label, lesson };
    } catch (e: any) {
      console.log(`FAILED (${e.message})`);
      return { id: course.id, label: course.label, lesson: null };
    }
  });
  courses = courses.filter((c) => c && c.lesson);
}

const snapshot = { date: ymd, generatedAt: now.toISOString(), topics: out, indicators, portfolio, knowledge, courses };
await Bun.write(`public/data/snapshots/${ymd}.json`, JSON.stringify(snapshot, null, 2));

const dates = readdirSync("public/data/snapshots")
  .filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort().reverse();
await Bun.write("public/data/index.json", JSON.stringify({ dates, latest: dates[0] }, null, 2));

const total = out.reduce((n, t) => n + t.items.length, 0);
console.log(`\n✓ Wrote ${ymd} — ${total} category stories across ${out.length} categories.`);
