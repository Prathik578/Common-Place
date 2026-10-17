import type { ReactNode } from "react";

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let token: RegExpExecArray | null;
  let index = 0;
  while ((token = pattern.exec(text)) !== null) {
    if (token.index > cursor) output.push(text.slice(cursor, token.index));
    const value = token[0];
    const key = `${keyPrefix}-${index++}`;
    if (value.startsWith("**")) output.push(<strong key={key}>{value.slice(2, -2)}</strong>);
    else if (value.startsWith("*")) output.push(<em key={key}>{value.slice(1, -1)}</em>);
    else if (value.startsWith("`")) output.push(<code key={key}>{value.slice(1, -1)}</code>);
    else {
      const parts = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(value);
      const label = parts?.[1] ?? value;
      const href = parts?.[2] ?? "";
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        output.push(<a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>);
      } else {
        output.push(label);
      }
    }
    cursor = token.index + value.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(<pre key={`block-${blocks.length}`}><code>{codeLines.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const children = inlineMarkdown(heading[2] ?? "", `heading-${blocks.length}`);
      if (level === 1) blocks.push(<h1 key={`block-${blocks.length}`}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={`block-${blocks.length}`}>{children}</h2>);
      else blocks.push(<h3 key={`block-${blocks.length}`}>{children}</h3>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`block-${blocks.length}`}>{inlineMarkdown(quote.join(" "), `quote-${blocks.length}`)}</blockquote>);
      continue;
    }
    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const matches = (candidate: string) => unordered
        ? /^\s*[-*+]\s+/.test(candidate)
        : /^\s*\d+[.)]\s+/.test(candidate);
      while (index < lines.length && matches(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(unordered ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      const listItems = items.map((item, itemIndex) => <li key={`item-${itemIndex}`}>{inlineMarkdown(item, `list-${blocks.length}-${itemIndex}`)}</li>);
      blocks.push(unordered ? <ul key={`block-${blocks.length}`}>{listItems}</ul> : <ol key={`block-${blocks.length}`}>{listItems}</ol>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() && !/^(#{1,3})\s+/.test(lines[index] ?? "") && !/^>\s?/.test(lines[index] ?? "") && !/^```/.test(lines[index] ?? "") && !/^\s*[-*+]\s+/.test(lines[index] ?? "") && !/^\s*\d+[.)]\s+/.test(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(<p key={`block-${blocks.length}`}>{inlineMarkdown(paragraph.join(" "), `paragraph-${blocks.length}`)}</p>);
  }
  return <div className="note-prose">{blocks}</div>;
}