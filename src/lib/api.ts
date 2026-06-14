// Static data layer — fetches JSON written by the daily generator into public/data/.
// No backend: same paths work in dev (Vite) and when deployed as a static site.

export interface Story {
  headline: string;
  brief: string;
  whyItMatters?: string;
  url: string;
  source: string;
  publishedAt?: string;
  featured?: boolean;   // editorial: promote into the hero band
}

export interface TopicBlock {
  id: string;
  name: string;
  intro?: string;
  items: Story[];
}

// ── Personal markets layer ──────────────────────────────────────────────
// Two daily "hard numbers" with a historical reference shown next to them.
export interface Indicator {
  key: string;            // "vix" | "cape"
  label: string;          // "VIX", "Shiller CAPE"
  value: string;          // "16.4" — kept as a string to preserve formatting
  reference: string;      // "range ~15–20", "media ~17"
  asOf?: string;          // date the value is as-of
  source?: string;        // "CBOE", "multpl.com"
  url?: string;           // source link
  tone?: "hot" | "calm" | "neutral";  // vs reference, for coloring
  level?: string;         // explicit "alto" | "nella norma" | "basso"
  arrow?: string;         // "↑" | "→" | "↓"
}

// One research stream: a single name (own story) or a cluster of cyclicals.
export interface PortfolioStream {
  id: string;
  label: string;          // "SAP" or "ASML & TSMC"
  kind: "name" | "cluster";
  names: string[];
  items: Story[];         // material news only; empty streams are dropped upstream
}

export interface PortfolioCluster {
  id: string;
  label: string;          // "Semis / AI hardware"
  streams: PortfolioStream[];
}

export interface Portfolio {
  name: string;           // "Le mie azioni" / "Calcio"
  clusters: PortfolioCluster[];
}

// ── Explore lane ("Orizzonti") ──────────────────────────────────────────
// Curated/explanatory, NOT news: each item is a told-with-context piece,
// signal-gated on quality, low frequency (rotating beats, 1-2 per day).
export interface ExploreItem {
  beat: string;           // "Storia vera", "Menti brillanti", …
  title: string;
  body: string;           // the told piece, plain and readable
  whyItMatters?: string;
  url?: string;           // optional further-reading link
  source?: string;
}

export interface Explore {
  name: string;           // "Orizzonti"
  items: ExploreItem[];
}

// ── Learning lanes (generated from knowledge, not searched) ──────────────
export interface Bite {
  beat: string;           // "Finance ratios", "Fisica", …
  title: string;          // the term/topic
  body: string;           // 1-3 plain sentences
  example?: string;       // optional example / formula-in-words / sample sentence
}
export interface Bites {
  name: string;           // "Bites"
  items: Bite[];
}

export interface LongformSection {
  heading?: string;
  paragraphs: string[];
}
export interface LongformArticle {
  beat: string;           // "System Design", "LLM & AI engineering — le basi"
  title: string;
  dek?: string;
  readingTime?: string;
  sections: LongformSection[];
  takeaways?: string[];
}
export interface Longform {
  name: string;           // "Long read"
  article: LongformArticle;
}

// ── Unified knowledge lane (Bites + Orizzonti merged, categorized) ──
export interface KnowledgeItem {
  categoryId: string;
  category: string;       // label
  title: string;
  body: string;
  example?: string;
  whyItMatters?: string;
}
export interface Knowledge {
  name: string;           // "Bites"
  items: KnowledgeItem[];
}

// ── Courses (curriculum long-form lessons, rich Markdown) ──
export interface CourseLesson {
  kind: "lesson" | "weekly" | "monthly";
  title: string;
  readingTime?: string;
  markdown: string;       // full lesson as Markdown (H1 title, ```mermaid, ![](url), ## Takeaways)
}
export interface Course {
  id: string;
  label: string;
  lesson: CourseLesson;
}

export interface Snapshot {
  date: string;          // YYYY-MM-DD
  generatedAt?: string;
  topics: TopicBlock[];
  indicators?: Indicator[];
  portfolio?: Portfolio | null;
  calcio?: Portfolio | null;   // same clustered shape, no indicators
  knowledge?: Knowledge | null;
  courses?: Course[] | null;
}

export interface NewsIndex {
  dates: string[];       // newest first
  latest: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

// BASE_URL is "/" in dev and "/daily-news/" on GitHub Pages (set via vite `base`).
// Always ends with a slash, so `${BASE}data/...` resolves correctly in both.
const BASE = import.meta.env.BASE_URL;
export const loadIndex = () => get<NewsIndex>(`${BASE}data/index.json`);
export const loadSnapshot = (date: string) => get<Snapshot>(`${BASE}data/snapshots/${date}.json`);

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-06-13" → "Sat 13 Jun" */
export const prettyDate = (ymd: string): string => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${wd} ${d} ${MONTHS[m]}`;
};

/** "2026-06-13" → "13 Jun" (compact, for the date strip) */
export const shortDate = (ymd: string): string => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m]}`;
};

/** ISO timestamp → "3h ago" / "Tue" — relative when recent, weekday otherwise. */
export const ago = (iso?: string): string => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return WEEKDAYS[new Date(t).getDay()];
};
