import { Fragment, type ReactNode } from "react";

/**
 * Safe Markdown → React elements for CMS text. Never produces an HTML string and never uses
 * dangerouslySetInnerHTML, so markup typed into content is shown as text, not run.
 *
 * Supported (deliberately small): paragraphs, line breaks, `##`/`###` headings (shown as h2/h3,
 * the page title is the h1), `-`/`*` and `1.` lists, `>` quotes, **bold**, *italic* or _italic_ and
 * [links](https://…). Links are allowed only for https:, http:, mailto: and site-relative paths;
 * anything else renders as plain text. External links get rel="noopener noreferrer".
 */

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^\/(?!\/)/.test(href) || href.startsWith("#")) return href;
  try {
    const u = new URL(href);
    if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:") return u.href;
  } catch {
    /* not a URL */
  }
  return null;
}

const INLINE = /(\*\*([^*]+)\*\*)|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)|(\[([^\]]+)\]\(([^)\s]+)\))/;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{renderInline(m[2], key)}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key}>{renderInline(m[4], key)}</em>);
    else if (m[6] !== undefined) out.push(<em key={key}>{renderInline(m[6], key)}</em>);
    else if (m[8] !== undefined) {
      const href = safeHref(m[9]!);
      if (href) {
        const external = /^https?:/.test(href);
        out.push(
          <a key={key} href={href} {...(external ? { rel: "noopener noreferrer" } : {})}>
            {m[8]}
          </a>,
        );
      } else out.push(m[8]);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function withBreaks(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((line, i) => (i === 0 ? [<Fragment key={`${key}-${i}`}>{renderInline(line, `${key}-${i}`)}</Fragment>] : [<br key={`${key}-br-${i}`} />, <Fragment key={`${key}-${i}`}>{renderInline(line, `${key}-${i}`)}</Fragment>]));
}

/**
 * `headingLevel` is the level used for `##` (and `###` is one deeper). Defaults to 2 (page bodies,
 * where the title is the h1); pass 4 when the text sits under an h3, e.g. inside a list entry.
 */
export function Markdown({ source, className, headingLevel = 2 }: { source: string; className?: string; headingLevel?: 2 | 3 | 4 }) {
  const H2 = `h${headingLevel}` as "h2" | "h3" | "h4";
  const H3 = `h${Math.min(headingLevel + 1, 5)}` as "h3" | "h4" | "h5";
  const blocks = source.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        const lines = block.split("\n");
        const heading = /^(#{1,3})\s+(.+)$/.exec(block);
        if (heading && lines.length === 1) {
          return heading[1]!.length === 3 ? <H3 key={key}>{renderInline(heading[2]!, key)}</H3> : <H2 key={key}>{renderInline(heading[2]!, key)}</H2>;
        }
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return <ul key={key}>{lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^[-*]\s+/, ""), `${key}-${j}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
          return <ol key={key}>{lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\d+[.)]\s+/, ""), `${key}-${j}`)}</li>)}</ol>;
        }
        if (lines.every((l) => /^>\s?/.test(l))) {
          return <blockquote key={key}><p>{withBreaks(lines.map((l) => l.replace(/^>\s?/, "")), key)}</p></blockquote>;
        }
        return <p key={key}>{withBreaks(lines, key)}</p>;
      })}
    </div>
  );
}
