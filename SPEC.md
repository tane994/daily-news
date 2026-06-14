# daily-news — edition spec (locked)

The daily job builds one snapshot per day (`public/data/snapshots/<date>.json`),
rendered by a static React app. Driven by the Claude Code CLI (`claude -p`, Max
login — no API key). Runs unattended via launchd, then pushes; GitHub Pages
rebuilds and serves the site. **Snapshots are the single source of truth** —
no-repeat, spaced repetition and course continuity are all derived by reading
prior snapshots (`scripts/lib/history.ts`).

The exact JSON shape the app reads is the contract in `src/lib/api.ts`. Editorial
config (sections, sources, portfolio, Bites categories, courses) is
`config/topics.json`.

## News desks (web search)

Two kinds:

- **Open beats** — genuine discovery via broad web search, then strict
  cross-section dedup:
  1. **AI & ML** (≤8) — capability & craft ONLY: new models (Anthropic/Claude,
     OpenAI/GPT, Google/Gemini…), new tools (e.g. NotebookLM), research,
     benchmarks, clever techniques. EXCLUDE the corporate/finance side of AI
     (IPOs, funding, M&A, mega-deals, exec/policy moves) → those go to Markets.
  2. **Markets & Finance** (≤8) — macro, public markets, big-cap corporate
     finance, AND the business of AI (an Anthropic IPO, an Apple deal,
     Altman/Hassabis/Amodei at the G7).
  3. **Startups & Tech** (≤3) — startup ecosystem + the product/operational side
     of tech. If a story's core is money/valuation/a deal, it's Markets, not here.

  **Dedup (hard):** every story lives in exactly ONE open beat, priority
  **AI > Markets > Startups**; no URL appears twice; **portfolio companies are
  excluded from all three** (covered in Le mie azioni). Each section runs in
  priority order and is told the headlines already taken, so there is no overlap.

- **Calendar desks** (fight desks, bounded search — both directions):
  4. **Boxing** (≤8) — recent results (with method/score) + cards this week +
     newly booked fights + top-fighter news. Name fighter, weight, title,
     date/venue. Sources: BoxRec, The Ring, ESPN Boxing, BoxingScene.
  5. **MMA** (≤3) — same shape (UFC + majors). Sources: Tapology, Sherdog,
     ESPN MMA, MMA Junkie, MMA Fighting.

Each news section marks its single biggest story `featured:true`. Drop any story
whose subject can't be named; use only facts from articles actually read.

Removed beats: World & Geopolitics ("enough bad news"), Calcio, and the old
"Orizzonti" explore lane (its themes live on inside Bites). History is now a
Bites category, not a news desk.

## Le mie azioni (portfolio) — fixed sources

Per-name where the company has its own story, cluster for cyclicals. 48h window,
≤3 items/stream, hide-if-empty, news + why-it-matters only (no prices):
- Semis / AI hardware → ASML & TSMC (cluster)
- Enterprise software → SAP (name), ServiceNow (name)
- Piattaforme → Alphabet & Amazon (cluster)
- Infra finanziaria → Visa, CME & DBS (cluster)
- Lusso → Hermès (name)
- SEA / EM → Sea Ltd (name)

Sources: Reuters, Bloomberg, Yahoo Finance, company IR/newsroom.

## Indicators

VIX (vs range ~15–20) and Shiller CAPE (vs mean ~17). Each shows the number, a
tone color, AND an explicit level label **"alto / nella norma / basso" with an
arrow ↑ → ↓** vs its reference — so high vs low is obvious, not just colored.

## Bites — knowledge lane, knowledge-only (NO web search)

8 categories, **one card each per day**, told with context, simple & readable,
from Claude's own knowledge (light fact-care only — verify only dates/numbers
you're sure of). **No-repeat over 21 days**: the generator reads recent snapshots
and avoids titles already used per category. The 8 categories:

1. **Finance ratios** — one metric at a time (P/E, ROIC, ROE, EBITDA, debt/equity,
   margins, FCF yield…): what it measures, the formula in words, how a retail
   investor reads it, a mini numeric example.
2. **Startup language** — one VC/startup term (ARR, churn, runway, SAFE, cap
   table, CAC/LTV, moat…): crisp definition, why it matters, a concrete example.
3. **Fisica** — one physics concept from zero, intuitive, with an analogy. No
   heavy math.
4. **Arte** — one work, movement, or technique: what to look at and why it matters.
5. **Storia** — true, causal history (a decision/cause-effect that explains the
   present), not decontextualized trivia.
6. **Menti brillanti** — one idea/mental model from a great mind (Taleb, Munger,
   Kahneman, Meadows, Naval, Feynman, Housel, the stoics…): what it says, why
   it's true, how to use it.
7. **Capire le cose** — how something works, evergreen: rotating semiconductors &
   supply chain, a real-economy mechanism, a technology we take for granted.
8. **Performance & longevità** — performance/longevity science applicable to
   training (the user does HYROX): one practical, grounded idea + how to apply it.

## Courses — daily curriculum lessons (rich Markdown)

4 stateful courses that **progress one lesson per day**, continuing where the
last snapshot left off (continuity derived from history). Each lesson is full
Markdown (H1 title, prose, tables, `## Takeaways`), rendered with KaTeX (math)
and Mermaid (diagrams). With **spaced repetition** (a short review of the
previous lesson) and **weekly / monthly recaps**.

1. **Grammatica tedesca** (it) — German grammar from A2 upward toward B1/B2.
2. **Business German** (it) — professional/office German from A2/B1 upward.
3. **System Design** (en) — distributed-system fundamentals in teaching order.
4. **LLM & AI engineering** (en) — theoretical foundations of LLMs / AI eng.

Only the courses use a web search (to embed one real illustrative image);
everything else in Bites and Courses is knowledge-only.

## Frontend

Static React + Vite SPA, no backend — fetches the JSON snapshots at runtime from
`<base>data/`. Dedicated "Corsi" page renders course Markdown (marked + KaTeX +
Mermaid). Built with `base: "/daily-news/"` for the GitHub Pages project site;
`src/lib/api.ts` reads `import.meta.env.BASE_URL` so the same code works in dev
(`/`) and on Pages (`/daily-news/`).

## Operational

- **Generation**: local, `bun run generate` (Claude Max + `claude` CLI on PATH +
  `history.ts`). The whole run is light and does not throttle.
- **Schedule**: launchd `com.andres.daily-news` runs `deploy/daily-run.sh` daily
  at 07:00 — generate → commit the new snapshot + manifest → push.
- **Hosting**: GitHub Pages, built & deployed by `.github/workflows/deploy.yml`
  on every push to `master`. New data → new build → site refresh, no backend.
- **State to commit**: `public/data/` (snapshots + index) IS the system's memory
  and must be committed. `dist/`, `node_modules`, `.env`, logs are gitignored.
