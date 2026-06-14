import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";
import mermaid from "mermaid";

marked.setOptions({ gfm: true, breaks: false });
// Render LaTeX math: inline $…$ and block $$…$$ (nonStandard relaxes spacing rules).
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

// Some models emit \(…\) and \[…\] — normalise to $…$ / $$…$$ for KaTeX.
const normMath = (s: string) =>
  s.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "inherit",
  themeVariables: { fontSize: "14px", background: "#14161d", primaryColor: "#181b23" },
});

type Part = { type: "text"; text: string } | { type: "mermaid"; code: string };

// Pull ```mermaid fences out of the markdown; everything else is rendered as HTML.
function splitMermaid(md: string): Part[] {
  const re = /```mermaid\s*([\s\S]*?)```/g;
  const parts: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m.index > last) parts.push({ type: "text", text: md.slice(last, m.index) });
    parts.push({ type: "mermaid", code: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ type: "text", text: md.slice(last) });
  return parts;
}

function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const id = "mmd-" + Math.random().toString(36).slice(2);
    mermaid
      .render(id, code)
      .then(({ svg }) => { if (!cancelled && ref.current) ref.current.innerHTML = svg; })
      .catch(() => {
        if (ref.current) {
          const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;");
          ref.current.innerHTML = `<pre class="md-pre"><code>${esc}</code></pre>`;
        }
      });
    return () => { cancelled = true; };
  }, [code]);
  return <div className="mermaid-wrap" ref={ref} />;
}

export function Article({ markdown }: { markdown: string }) {
  const parts = useMemo(() => splitMermaid(markdown), [markdown]);
  return (
    <div className="md">
      {parts.map((p, i) =>
        p.type === "mermaid" ? (
          <Mermaid key={i} code={p.code} />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: marked.parse(normMath(p.text)) as string }} />
        ),
      )}
    </div>
  );
}
