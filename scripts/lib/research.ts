// Date-aware web-search calls driven through the Claude Code CLI in headless
// mode (`claude -p`). This uses the local Claude Max login (OAuth) instead of a
// metered API key — no ANTHROPIC_API_KEY needed — and the CLI runs the built-in
// WebSearch / WebFetch tools server-side. Claude searches, reads the real
// articles, and returns strict JSON. The CLI prints a JSON envelope
// ({ type:"result", is_error, result, ... }); we parse stdout, take `.result`,
// then pull the JSON value out of the model's text.

import {
  SYSTEM_PROMPT, userPrompt,
  CALENDAR_SYSTEM_PROMPT, calendarPrompt,
  CALCIO_SYSTEM_PROMPT, calcioPrompt,
  ENTITY_SYSTEM_PROMPT, entityPrompt,
  INDICATORS_SYSTEM_PROMPT, indicatorsPrompt,
  EXPLORE_SYSTEM_PROMPT, explorePrompt,
  BITES_SYSTEM_PROMPT, bitesPrompt,
  LONGFORM_SYSTEM_PROMPT, longformPrompt,
  KNOWLEDGE_SYSTEM_PROMPT, knowledgePrompt,
  COURSE_SYSTEM_PROMPT, courseLessonPrompt, courseRecapPrompt,
} from "./prompt.ts";

export interface RawStory {
  headline: string;
  brief: string;
  whyItMatters?: string;
  url: string;
  source: string;
  publishedAt?: string;
  featured?: boolean;
}

export interface TopicResult {
  intro: string;
  items: RawStory[];
}

export interface TopicConfig {
  id: string;
  name: string;
  maxItems?: number;
  sources?: string[];
  mode?: "calendar";      // calendar = forward-looking sports desk
  guidance?: string;
}

export interface ExploreBeatConfig {
  id: string;
  label: string;
  scope: string;
}

export interface ExploreItem {
  beat: string;
  title: string;
  body: string;
  whyItMatters?: string;
  url?: string;
  source?: string;
}

export interface LearnBeatConfig {
  id: string;
  label: string;
  scope: string;
}

export interface BiteItem {
  beat: string;
  title: string;
  body: string;
  example?: string;
}

export interface LongformSection {
  heading?: string;
  paragraphs: string[];
}

export interface LongformArticle {
  beat: string;
  title: string;
  dek?: string;
  readingTime?: string;
  sections: LongformSection[];
  takeaways?: string[];
}

// ── Unified knowledge lane (Bites + Orizzonti merged, categorized) ──
export interface KnowledgeCategoryConfig {
  id: string;
  label: string;
  scope: string;
}
export interface KnowledgeItem {
  categoryId: string;
  category: string;
  title: string;
  body: string;
  example?: string;
  whyItMatters?: string;
}

// ── Courses (curriculum long-form lessons, rich Markdown) ──
export interface CourseConfig {
  id: string;
  label: string;
  scope: string;
  lang?: "it" | "en";   // output language for explanations (default it)
}
export interface CourseLesson {
  kind: "lesson" | "weekly" | "monthly";
  title: string;
  readingTime?: string;
  markdown: string;       // the full lesson as Markdown
}

// One research stream: a single name or a cluster of cyclicals.
export interface StreamConfig {
  id: string;
  label: string;
  kind: "name" | "cluster";
  names: string[];
}

export interface IndicatorConfig {
  key: string;
  label: string;
}

export interface IndicatorReading {
  key: string;
  value: string;
  asOf?: string;
  source?: string;
  url?: string;
}

// Each call may run several searches + article fetches; give it room but don't
// let a wedged call hang the whole daily run. Cluster streams (multi-subject)
// and curated Explore calls can be slow, especially when several run at once.
const TIMEOUT_MS = 9 * 60 * 1000;

/** Strip ``` fences and slice to the outermost JSON value (object or array). */
function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const firsts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  const start = firsts.length ? Math.min(...firsts) : -1;
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

/** Pull the {intro, items} object out of the model's final text. */
function parseResult(text: string): TopicResult {
  const t = extractJson(text);
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error(`model did not return valid JSON: ${t.slice(0, 200)}`);
  }
  return {
    intro: typeof obj.intro === "string" ? obj.intro : "",
    items: Array.isArray(obj.items) ? obj.items : [],
  };
}

/**
 * Run one headless `claude -p` turn and return the model's `.result` text.
 * Forces the Max OAuth login (never metered billing), bounds the run with a
 * timeout, and throws a descriptive Error on any failure — callers in
 * generate-daily.ts tolerate that and keep the run going.
 */
async function runClaude(
  userText: string,
  systemText: string,
  model: string,
  allowedTools = "WebSearch,WebFetch",
): Promise<string> {
  // Strip any API-key / endpoint overrides from the child env so the CLI falls
  // back to the local OAuth login against the standard Anthropic endpoint —
  // even if the shell that launched us exported a key or a custom/proxy URL.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;

  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      userText,
      "--append-system-prompt",
      systemText,
      "--output-format",
      "json",
      "--model",
      model,
      "--allowedTools",
      allowedTools,
      "--permission-mode",
      "bypassPermissions",
    ],
    {
      cwd: process.cwd(),
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );

  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  try {
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
  } catch (e: any) {
    throw new Error(`claude CLI did not complete: ${e?.message ?? e}`);
  }

  // AbortSignal.timeout kills the child with SIGTERM → exit 143 (or null on
  // some platforms); surface that distinctly so logs tell a timeout apart from
  // a genuine CLI failure.
  if (exitCode === 143 || exitCode === null) {
    throw new Error(`claude CLI timed out (>${TIMEOUT_MS / 60000} min)`);
  }
  if (exitCode !== 0) {
    const tail = stderr.trim().slice(-300) || stdout.trim().slice(-300);
    throw new Error(`claude CLI exited ${exitCode}${tail ? `: ${tail}` : ""}`);
  }

  let envelope: any;
  try {
    envelope = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`unparseable CLI envelope: ${stdout.trim().slice(0, 300)}`);
  }
  if (envelope.is_error || envelope.subtype !== "success") {
    const why = String(envelope.result ?? envelope.subtype ?? "unknown").slice(0, 300);
    throw new Error(`claude CLI reported an error: ${why}`);
  }
  if (typeof envelope.result !== "string") {
    throw new Error("claude CLI envelope had no string `result`");
  }
  return envelope.result;
}

/** A full category section: section intro + ranked stories. */
export async function researchTopic(
  topic: TopicConfig,
  dateLabel: string,
  model: string,
  exclude?: string[],
  covered?: string[],
): Promise<TopicResult> {
  const [user, system] =
    topic.mode === "calendar"
      ? [calendarPrompt(topic, dateLabel), CALENDAR_SYSTEM_PROMPT]
      : [userPrompt(topic, dateLabel, exclude, covered), SYSTEM_PROMPT];
  const result = await runClaude(user, system, model);
  return parseResult(result);
}

/** A single holdings stream (one name or a cluster). Empty on quiet days. */
export async function researchEntity(
  stream: StreamConfig,
  dateLabel: string,
  model: string,
  windowHours: number,
  maxItems: number,
  sources?: string[],
): Promise<RawStory[]> {
  const result = await runClaude(
    entityPrompt(stream, dateLabel, windowHours, maxItems, sources),
    ENTITY_SYSTEM_PROMPT,
    model,
  );
  return parseResult(result).items;
}

/** A single calcio stream (a league's clubs, or one club). Empty on quiet days. */
export async function researchCalcio(
  stream: StreamConfig,
  dateLabel: string,
  model: string,
  windowHours: number,
  maxItems: number,
  sources?: string[],
): Promise<RawStory[]> {
  const result = await runClaude(
    calcioPrompt(stream, dateLabel, windowHours, maxItems, sources),
    CALCIO_SYSTEM_PROMPT,
    model,
  );
  return parseResult(result).items;
}

/** Up to `count` curated "Orizzonti" items for a beat (from knowledge, no search). */
export async function researchExplore(
  beat: ExploreBeatConfig,
  dateLabel: string,
  model: string,
  count = 1,
): Promise<ExploreItem[]> {
  // Knowledge-only: grant a no-op tool (never WebSearch) so the model answers
  // from its own knowledge — fast, cheap, and immune to web-search throttling.
  const result = await runClaude(explorePrompt(beat, dateLabel, count), EXPLORE_SYSTEM_PROMPT, model, "Read");
  const t = extractJson(result);
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error(`explore (${beat.id}): invalid JSON: ${t.slice(0, 200)}`);
  }
  const arr: any[] = Array.isArray(obj?.items) ? obj.items : obj?.item ? [obj.item] : obj?.title ? [obj] : [];
  return arr
    .filter((raw) => raw && typeof raw.title === "string" && typeof raw.body === "string")
    .slice(0, count)
    .map((raw) => ({
      beat: beat.label,
      title: raw.title,
      body: raw.body,
      whyItMatters: typeof raw.whyItMatters === "string" ? raw.whyItMatters : undefined,
      url: typeof raw.url === "string" ? raw.url : undefined,
      source: typeof raw.source === "string" ? raw.source : undefined,
    }));
}

/** Current values for the daily indicator strip (VIX, Shiller CAPE, …). */
export async function researchIndicators(
  indicators: IndicatorConfig[],
  dateLabel: string,
  model: string,
): Promise<IndicatorReading[]> {
  const result = await runClaude(
    indicatorsPrompt(indicators, dateLabel),
    INDICATORS_SYSTEM_PROMPT,
    model,
  );
  const t = extractJson(result);
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error(`indicators: invalid JSON: ${t.slice(0, 200)}`);
  }
  const arr: any[] = Array.isArray(obj) ? obj : Array.isArray(obj.indicators) ? obj.indicators : [];
  return arr
    .filter((r) => r && typeof r.key === "string" && (typeof r.value === "string" || typeof r.value === "number"))
    .map((r) => ({
      key: r.key,
      value: String(r.value),
      asOf: typeof r.asOf === "string" ? r.asOf : undefined,
      source: typeof r.source === "string" ? r.source : undefined,
      url: typeof r.url === "string" ? r.url : undefined,
    }));
}

/** "Bites": one generated micro-card per beat (knowledge only, no web search). */
export async function researchBites(
  beats: LearnBeatConfig[],
  dateLabel: string,
  model: string,
): Promise<BiteItem[]> {
  const result = await runClaude(
    bitesPrompt(beats.map((b) => ({ label: b.label, scope: b.scope })), dateLabel),
    BITES_SYSTEM_PROMPT,
    model,
    "Read", // no WebSearch — generated from knowledge
  );
  const t = extractJson(result);
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error(`bites: invalid JSON: ${t.slice(0, 200)}`);
  }
  const arr: any[] = Array.isArray(obj?.items) ? obj.items : [];
  const byLabel = new Map(beats.map((b) => [b.label.toLowerCase(), b.label]));
  return arr
    .filter((raw) => raw && typeof raw.title === "string" && typeof raw.body === "string")
    .map((raw) => ({
      beat: byLabel.get(String(raw.beat ?? "").toLowerCase()) ?? String(raw.beat ?? ""),
      title: raw.title,
      body: raw.body,
      example: typeof raw.example === "string" && raw.example.trim() ? raw.example : undefined,
    }));
}

/** Unified Bites: one categorized micro-card per category (knowledge only, no-repeat). */
export async function researchKnowledge(
  categories: KnowledgeCategoryConfig[],
  dateLabel: string,
  model: string,
  coveredByCat: Record<string, string[]>,
): Promise<KnowledgeItem[]> {
  const result = await runClaude(
    knowledgePrompt(categories.map((c) => ({ id: c.id, label: c.label, scope: c.scope })), dateLabel, coveredByCat),
    KNOWLEDGE_SYSTEM_PROMPT,
    model,
    "Read", // no WebSearch — generated from knowledge
  );
  const t = extractJson(result);
  let obj: any;
  try { obj = JSON.parse(t); } catch { throw new Error(`knowledge: invalid JSON: ${t.slice(0, 200)}`); }
  const arr: any[] = Array.isArray(obj?.items) ? obj.items : [];
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return arr
    .filter((raw) => raw && typeof raw.title === "string" && typeof raw.body === "string")
    .map((raw) => ({
      categoryId: String(raw.categoryId ?? ""),
      category: byId.get(String(raw.categoryId ?? "")) ?? String(raw.category ?? ""),
      title: raw.title,
      body: raw.body,
      example: typeof raw.example === "string" && raw.example.trim() ? raw.example : undefined,
      whyItMatters: typeof raw.whyItMatters === "string" && raw.whyItMatters.trim() ? raw.whyItMatters : undefined,
    }))
    .filter((it) => byId.has(it.categoryId)); // keep only known categories, one per id
}

/** One course lesson (or weekly/monthly recap). Web search enabled for an optional image. */
export async function researchCourse(
  course: CourseConfig,
  dateLabel: string,
  model: string,
  opts: {
    kind: "lesson" | "weekly" | "monthly";
    covered?: string[];
    yesterday?: { title: string; dek?: string } | null;
    lessons?: { title: string; dek?: string }[];
  },
): Promise<CourseLesson> {
  const user =
    opts.kind === "lesson"
      ? courseLessonPrompt(course, dateLabel, opts.covered ?? [], opts.yesterday)
      : courseRecapPrompt(course, dateLabel, opts.kind, opts.lessons ?? []);
  // Web search on so the model can find a real image to embed. The reply IS the
  // Markdown article — no JSON wrapping (which broke on large bodies with braces).
  let md = (await runClaude(user, COURSE_SYSTEM_PROMPT, model, "WebSearch,WebFetch")).trim();
  // Strip a stray ```markdown … ``` fence if the model wrapped the whole reply.
  const wrap = md.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/);
  if (wrap) md = wrap[1].trim();
  if (md.length < 80) throw new Error(`course ${course.id} (${opts.kind}): empty/short markdown`);
  const titleMatch = md.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch ? titleMatch[1].trim() : course.label;
  const words = md.split(/\s+/).filter(Boolean).length;
  return {
    kind: opts.kind,
    title,
    readingTime: `~${Math.max(1, Math.round(words / 200))} min`,
    markdown: md,
  };
}

/** "Long read": one generated long-form explainer for the day's beat (knowledge only). */
export async function researchLongform(
  beat: LearnBeatConfig,
  dateLabel: string,
  model: string,
): Promise<LongformArticle> {
  const result = await runClaude(
    longformPrompt({ label: beat.label, scope: beat.scope }, dateLabel),
    LONGFORM_SYSTEM_PROMPT,
    model,
    "Read", // no WebSearch — generated from knowledge
  );
  const t = extractJson(result);
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error(`longform (${beat.id}): invalid JSON: ${t.slice(0, 200)}`);
  }
  const rawSections: any[] = Array.isArray(obj?.sections) ? obj.sections : [];
  const sections: LongformSection[] = rawSections
    .map((s) => ({
      heading: typeof s?.heading === "string" ? s.heading : undefined,
      paragraphs: Array.isArray(s?.paragraphs)
        ? s.paragraphs.filter((p: any) => typeof p === "string" && p.trim())
        : typeof s?.body === "string" ? [s.body] : [],
    }))
    .filter((s) => s.paragraphs.length > 0);
  if (typeof obj?.title !== "string" || sections.length === 0) {
    throw new Error(`longform (${beat.id}): missing title or sections`);
  }
  return {
    beat: beat.label,
    title: obj.title,
    dek: typeof obj.dek === "string" ? obj.dek : undefined,
    readingTime: typeof obj.readingTime === "string" ? obj.readingTime : undefined,
    sections,
    takeaways: Array.isArray(obj.takeaways)
      ? obj.takeaways.filter((x: any) => typeof x === "string" && x.trim())
      : undefined,
  };
}
