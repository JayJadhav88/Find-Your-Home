import type { ReactNode } from "react";

// Renders a small, safe Markdown subset (headings, paragraphs, lists, **bold**, [links](https://…)).
// Text is never injected as HTML, so admin-edited content cannot add scripts.

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|mailto:[^\s)]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) nodes.push(<strong key={match.index}>{match[1]}</strong>);
    else nodes.push(<a key={match.index} href={match[3]} className="text-brand underline">{match[2]}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SimpleMarkdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-4 leading-relaxed">
      {blocks.map((block, index) => {
        const heading = /^(#{1,3})\s+(.*)$/.exec(block);
        if (heading) {
          const level = heading[1]!.length;
          const className = level === 1 ? "text-2xl font-semibold" : level === 2 ? "text-xl font-semibold" : "text-lg font-semibold";
          return level === 1 ? <h2 key={index} className={className}>{inline(heading[2]!)}</h2>
            : level === 2 ? <h3 key={index} className={className}>{inline(heading[2]!)}</h3>
            : <h4 key={index} className={className}>{inline(heading[2]!)}</h4>;
        }
        const lines = block.split("\n");
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={index} className="list-disc pl-6">
              {lines.map((line, item) => <li key={item}>{inline(line.replace(/^[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={index} className="whitespace-pre-line">{inline(block)}</p>;
      })}
    </div>
  );
}
