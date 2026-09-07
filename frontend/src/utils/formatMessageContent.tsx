import React from 'react';

// Chat messages only ever need inline emphasis + links, not full Markdown
// (tables, headers, lists) — a small hand-rolled parser avoids pulling in a
// full Markdown dependency for four patterns. Bold is matched before italic
// so "**x**" doesn't get read as two stray "*" italics.
const TOKEN_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(\S+?\))/g;

export function formatMessageContent(content: string): React.ReactNode[] {
  const parts = content.split(TOKEN_PATTERN).filter((part) => part.length > 0);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={i} className="bg-[#101010] border border-teams-border/60 rounded px-1 py-0.5 text-[11px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\((\S+?)\)$/);
    if (linkMatch) {
      const [, text, url] = linkMatch;
      const isSafe = /^https?:\/\//i.test(url) || url.startsWith('/');
      if (isSafe) {
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teams-accent hover:underline break-all"
          >
            {text}
          </a>
        );
      }
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
