import { useEffect, useState } from "react";
import { Article } from "./Article";
import type { Course } from "./lib/api";

const COURSE_COLOR: Record<string, string> = {
  "de-grammar": "#f0a868", "de-business": "#5ec8c8",
  "system-design": "#6d7cff", "ai-eng": "#36d6a0",
};
const ccolor = (id: string) => COURSE_COLOR[id] ?? "#6d7cff";
const kindLabel = (k: string) => (k === "weekly" ? "Recap settimanale" : k === "monthly" ? "Recap mensile" : "Lezione");

export function CorsiPage({ courses }: { courses: Course[] }) {
  const [sel, setSel] = useState<string>(courses[0]?.id ?? "");
  // Keep selection valid as data changes (date navigation).
  useEffect(() => {
    if (courses.length && !courses.some((c) => c.id === sel)) setSel(courses[0].id);
  }, [courses, sel]);

  if (!courses.length) return <div className="loading">Nessuna lezione per oggi. Lancia <code>bun run generate</code>.</div>;

  const cur = courses.find((c) => c.id === sel) ?? courses[0];
  const l = cur.lesson;
  const accent = ccolor(cur.id);

  return (
    <div className="corsi">
      <div className="course-tabs">
        {courses.map((c) => (
          <button
            key={c.id}
            className={c.id === cur.id ? "active" : ""}
            style={{ ["--c" as any]: ccolor(c.id) }}
            onClick={() => setSel(c.id)}
          >
            <span className="sq" style={{ background: ccolor(c.id) }} />
            {c.label}
            {c.lesson.kind !== "lesson" && <span className="tab-badge">recap</span>}
          </button>
        ))}
      </div>

      <article className="course band" style={{ ["--c" as any]: accent }}>
        <div className="course-kind" style={{ color: accent }}>
          {cur.label} · {kindLabel(l.kind)}{l.readingTime ? ` · ${l.readingTime}` : ""}
        </div>
        <Article markdown={l.markdown} />
      </article>
    </div>
  );
}
