import { useEffect, useMemo, useState } from "react";
import {
  loadIndex, loadSnapshot, prettyDate, shortDate, ago,
  type NewsIndex, type Snapshot, type Story, type TopicBlock,
  type Indicator, type Portfolio, type PortfolioCluster, type Knowledge,
} from "./lib/api";
import { CorsiPage } from "./CorsiPage";

const CAT_COLOR: Record<string, string> = {
  ai: "#6d7cff", startups: "#36d6a0", markets: "#ffb547",
  boxing: "#ff8a5b", mma: "#c264ff", world: "#ff6b7a", history: "#5ea3ff",
  portfolio: "#d8b25a", calcio: "#4fc77d",
  // knowledge categories
  "fin-ratios": "#ffb547", "startup-lang": "#36d6a0", physics: "#6d7cff",
  art: "#ff8a5b", storia: "#5ea3ff", menti: "#a78bfa", capire: "#4fc77d",
  performance: "#ff6b7a",
};
const color = (id: string) => CAT_COLOR[id] ?? "#6d7cff";

function todayYMD(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const Byline = ({ s }: { s: Story }) => (
  <div className="byline">
    <span className="src">{s.source}</span>
    {s.publishedAt && <><span className="dotsep">·</span><span>{ago(s.publishedAt)}</span></>}
  </div>
);

const Why = ({ s }: { s: { whyItMatters?: string } }) =>
  s.whyItMatters ? <div className="why"><b>Why it matters:</b> {s.whyItMatters}</div> : null;

const Eyebrow = ({ t }: { t: { id: string; name: string } }) => (
  <span className="eyebrow" style={{ color: color(t.id) }}>
    <span className="sq" style={{ background: color(t.id) }} />{t.name}
  </span>
);

const IndicatorTicker = ({ items }: { items: Indicator[] }) => (
  <div className="ticker">
    {items.map((i) => {
      const inner = (
        <>
          <div className="ind-top">
            <span className="ind-label">{i.label}</span>
            <span className="ind-value tnum">{i.value}</span>
            {i.level && <span className="ind-level">{i.arrow} {i.level}</span>}
          </div>
          <div className="ind-sub">{i.reference}</div>
          {(i.asOf || i.source) && (
            <div className="ind-asof">
              {i.asOf ? `as of ${i.asOf}` : ""}{i.asOf && i.source ? " · " : ""}{i.source ?? ""}
            </div>
          )}
        </>
      );
      return i.url ? (
        <a className="ind ticker-ind" data-tone={i.tone ?? "neutral"} key={i.key} href={i.url} target="_blank" rel="noreferrer">{inner}</a>
      ) : (
        <div className="ind" data-tone={i.tone ?? "neutral"} key={i.key}>{inner}</div>
      );
    })}
  </div>
);

const SectionPanel = ({ t }: { t: TopicBlock }) => {
  const [slead, ...rest] = t.items;
  if (!slead) return null;
  return (
    <section className="panel" id={`sec-${t.id}`}>
      <div className="section-head">
        <span className="bar" style={{ background: color(t.id) }} />
        <h2>{t.name}</h2>
        <span className="count">{t.items.length}</span>
      </div>
      {t.intro && <div className="section-intro">{t.intro}</div>}
      <a className="story slead" href={slead.url} target="_blank" rel="noreferrer">
        <div className="hl">{slead.headline}</div>
        <div className="brief">{slead.brief}</div>
        <Why s={slead} />
        <Byline s={slead} />
      </a>
      {rest.length > 0 && (
        <div className="minilist">
          {rest.map((s, i) => (
            <a className="story minirow" key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer">
              <div className="hl">{s.headline}</div>
              <div className="brief">{s.brief}</div>
              <Byline s={s} />
            </a>
          ))}
        </div>
      )}
    </section>
  );
};

const ClusterGrid = ({ blocks, accent }: { blocks: PortfolioCluster[]; accent: string }) => (
  <div className="clusters">
    {blocks.map((c) => (
      <div className="cluster" key={c.id}>
        <div className="cluster-label" style={{ color: accent }}>{c.label}</div>
        {c.streams.map((st) => (
          <div className="stream" key={st.id}>
            <div className="stream-label">{st.label}</div>
            <div className="minilist">
              {st.items.map((s, i) => (
                <a className="story minirow" key={`${st.id}-${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer">
                  <div className="hl">{s.headline}</div>
                  <div className="brief">{s.brief}</div>
                  <Why s={s} />
                  <Byline s={s} />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    ))}
  </div>
);

const WatchBand = ({ data, id }: { data: Portfolio; id: string }) => {
  const count = data.clusters.reduce((n, c) => n + c.streams.reduce((m, s) => m + s.items.length, 0), 0);
  return (
    <section className="band" id={`sec-${id}`}>
      <div className="section-head">
        <span className="bar" style={{ background: color(id) }} />
        <h2>{data.name}</h2>
        {count > 0 && <span className="count">{count}</span>}
      </div>
      <ClusterGrid blocks={data.clusters} accent={color(id)} />
    </section>
  );
};

// Unified categorized micro-knowledge (one card per category).
const KnowledgeBand = ({ data }: { data: Knowledge }) => (
  <section className="band" id="sec-bites">
    <div className="section-head">
      <span className="bar" style={{ background: "#5ec8c8" }} />
      <h2>{data.name}</h2>
      <span className="count">{data.items.length}</span>
    </div>
    <div className="bites">
      {data.items.map((b, i) => (
        <div className="bite" key={i}>
          <div className="bite-beat" style={{ color: color(b.categoryId) }}>{b.category}</div>
          <div className="bite-title">{b.title}</div>
          <div className="bite-body">{b.body}</div>
          {b.example && <div className="bite-ex">{b.example}</div>}
          {b.whyItMatters && <div className="bite-why"><b>↳</b> {b.whyItMatters}</div>}
        </div>
      ))}
    </div>
  </section>
);

const watchCount = (p?: Portfolio | null) =>
  p ? p.clusters.reduce((n, c) => n + c.streams.reduce((m, s) => m + s.items.length, 0), 0) : 0;

function App() {
  const [index, setIndex] = useState<NewsIndex | null>(null);
  const [date, setDate] = useState<string>("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [active, setActive] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"daily" | "corsi">(() => (location.hash.includes("corsi") ? "corsi" : "daily"));

  useEffect(() => {
    const onHash = () => setView(location.hash.includes("corsi") ? "corsi" : "daily");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (v: "daily" | "corsi") => { location.hash = v === "corsi" ? "#/corsi" : "#/"; setView(v); };

  useEffect(() => {
    loadIndex()
      .then((ix) => { setIndex(ix); setDate(ix.latest); })
      .catch(() => setErr("No briefs yet. Run `bun run generate` to create today's edition."));
  }, []);

  useEffect(() => {
    if (!date) return;
    setSnap(null);
    loadSnapshot(date).then(setSnap).catch(() => setErr(`Couldn't load ${date}.`));
  }, [date]);

  const dates = index?.dates ?? [];
  const pos = dates.indexOf(date);

  const { hero, highlights, sections } = useMemo(() => {
    if (!snap) return { hero: null, highlights: [] as { s: Story; t: TopicBlock }[], sections: [] as TopicBlock[] };
    const flat = snap.topics.flatMap((t) => t.items.map((s) => ({ s, t })));
    const picked: { s: Story; t: TopicBlock }[] = flat.filter((x) => x.s.featured);
    for (const t of snap.topics) {
      if (picked.length >= 3) break;
      const top = t.items[0];
      if (top && !picked.some((p) => p.s.url === top.url)) picked.push({ s: top, t });
    }
    const used = new Set(picked.map((p) => p.s.url));
    const sections = snap.topics
      .map((t) => ({ ...t, items: t.items.filter((s) => !used.has(s.url)) }))
      .filter((t) => t.items.length > 0);
    return { hero: picked[0] ?? null, highlights: picked.slice(1, 3), sections };
  }, [snap]);

  const staleNote = useMemo(() => {
    if (!index || !date || date === todayYMD()) return null;
    if (date === index.latest) return `Showing ${prettyDate(date)} — today's brief hasn't run yet.`;
    return null;
  }, [index, date]);

  const indicators = snap?.indicators ?? [];
  const portfolio = snap?.portfolio ?? null;
  const calcio = snap?.calcio ?? null;
  const knowledge = snap?.knowledge ?? null;
  const courses = snap?.courses ?? [];
  const showPortfolio = !!portfolio && portfolio.clusters.length > 0;
  const showCalcio = !!calcio && calcio.clusters.length > 0;
  const showKnowledge = !!knowledge && knowledge.items.length > 0;

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`sec-${id}`)?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <div className="dot" />
          <div>
            <h1>Daily News</h1>
            <p>{date ? prettyDate(date) : "—"}</p>
          </div>
        </div>
        <div className="mast-right">
          <div className="viewtoggle">
            <button className={view === "daily" ? "active" : ""} onClick={() => go("daily")}>Daily</button>
            <button className={view === "corsi" ? "active" : ""} onClick={() => go("corsi")}>
              Corsi{courses.length ? <span className="n">{courses.length}</span> : null}
            </button>
          </div>
          {dates.length > 0 && (
            <div className="datenav">
              <button onClick={() => setDate(dates[pos + 1])} disabled={pos >= dates.length - 1} aria-label="Older">‹</button>
              <span className="label">{prettyDate(date)}</span>
              <button onClick={() => setDate(dates[pos - 1])} disabled={pos <= 0} aria-label="Newer">›</button>
            </div>
          )}
        </div>
      </header>

      {!err && !snap && <div className="loading">Loading…</div>}
      {err && !snap && <div className="loading">{err}</div>}

      {/* ── Corsi page ── */}
      {view === "corsi" && snap && <CorsiPage courses={courses} />}

      {/* ── Daily page ── */}
      {view === "daily" && snap && (
        <>
          <nav className="topnav">
            {showPortfolio && (
              <button className={active === "portfolio" ? "active" : ""} onClick={() => jump("portfolio")}>
                <span className="sq" style={{ background: color("portfolio") }} />{portfolio!.name}
                <span className="n">{watchCount(portfolio)}</span>
              </button>
            )}
            {snap.topics.map((t) => (
              <button key={t.id} className={active === t.id ? "active" : ""} onClick={() => jump(t.id)}>
                <span className="sq" style={{ background: color(t.id) }} />{t.name}
                <span className="n">{t.items.length}</span>
              </button>
            ))}
            {showCalcio && (
              <button className={active === "calcio" ? "active" : ""} onClick={() => jump("calcio")}>
                <span className="sq" style={{ background: color("calcio") }} />{calcio!.name}
                <span className="n">{watchCount(calcio)}</span>
              </button>
            )}
            {showKnowledge && (
              <button className={active === "bites" ? "active" : ""} onClick={() => jump("bites")}>
                <span className="sq" style={{ background: "#5ec8c8" }} />{knowledge!.name}
                <span className="n">{knowledge!.items.length}</span>
              </button>
            )}
            {dates.length > 1 && (
              <div className="archive-wrap">
                {dates.map((d) => (
                  <button key={d} className={`arch ${d === date ? "active" : ""}`} onClick={() => setDate(d)}>
                    {shortDate(d)}
                  </button>
                ))}
              </div>
            )}
          </nav>

          {staleNote && <div className="note">{staleNote}</div>}
          {indicators.length > 0 && <IndicatorTicker items={indicators} />}

          {hero && (
            <section className="hero">
              <a className="story lead" href={hero.s.url} target="_blank" rel="noreferrer">
                <Eyebrow t={hero.t} />
                <div className="hl">{hero.s.headline}</div>
                <div className="brief">{hero.s.brief}</div>
                <Why s={hero.s} />
                <Byline s={hero.s} />
              </a>
              <div className="herostack">
                {highlights.map(({ s, t }, i) => (
                  <a className="story feat" key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer">
                    <Eyebrow t={t} />
                    <div className="hl">{s.headline}</div>
                    <div className="brief">{s.brief}</div>
                    <Byline s={s} />
                  </a>
                ))}
              </div>
            </section>
          )}

          {showPortfolio && <WatchBand data={portfolio!} id="portfolio" />}

          <div className="bento">
            {sections.map((t) => <SectionPanel t={t} key={t.id} />)}
          </div>

          {showCalcio && <WatchBand data={calcio!} id="calcio" />}
          {showKnowledge && <KnowledgeBand data={knowledge!} />}
        </>
      )}
    </div>
  );
}

export default App;
