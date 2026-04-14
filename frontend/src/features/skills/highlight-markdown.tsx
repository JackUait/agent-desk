import { Fragment, type ReactNode } from "react";

const MARK = "text-accent-blue/70";
const CODE_BG = "rounded bg-bg-surface/80 text-text-primary";
const STRONG = "font-semibold text-text-primary";
const EM = "italic text-text-secondary";
const LINK_TEXT = "text-accent-blue underline decoration-accent-blue/40 underline-offset-2";
const URL_TEXT = "text-text-muted";
const HEADING_HASH = "font-bold text-accent-blue";
const HEADING_TEXT = "font-semibold text-text-primary";
const LIST_MARK = "text-accent-blue";
const QUOTE_MARK = "text-accent-blue";
const QUOTE_TEXT = "italic text-text-secondary";
const HR = "text-accent-blue";
const FENCE = "text-accent-blue";
const FENCE_BODY = "text-text-secondary";

export function highlightMarkdown(src: string): ReactNode {
  const lines = src.split("\n");
  const out: ReactNode[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFenceDelim = /^\s*```/.test(line);
    let node: ReactNode;
    if (isFenceDelim) {
      node = <span className={FENCE}>{line}</span>;
      inFence = !inFence;
    } else if (inFence) {
      node = <span className={FENCE_BODY}>{line || "\u00A0"}</span>;
    } else {
      node = highlightLine(line);
    }
    out.push(
      <Fragment key={i}>
        {node}
        {i < lines.length - 1 ? "\n" : null}
      </Fragment>,
    );
  }
  return out;
}

function highlightLine(line: string): ReactNode {
  if (line.length === 0) return "\u00A0";

  const heading = /^(\s*)(#{1,6})(\s+)(.*)$/.exec(line);
  if (heading) {
    return (
      <>
        {heading[1]}
        <span className={HEADING_HASH}>{heading[2]}</span>
        {heading[3]}
        <span className={HEADING_TEXT}>{inlineHighlight(heading[4])}</span>
      </>
    );
  }

  const quote = /^(\s*)(>+)(\s*)(.*)$/.exec(line);
  if (quote) {
    return (
      <>
        {quote[1]}
        <span className={QUOTE_MARK}>{quote[2]}</span>
        {quote[3]}
        <span className={QUOTE_TEXT}>{inlineHighlight(quote[4])}</span>
      </>
    );
  }

  const list = /^(\s*)([-*+]|\d+\.)(\s+)(.*)$/.exec(line);
  if (list) {
    return (
      <>
        {list[1]}
        <span className={LIST_MARK}>{list[2]}</span>
        {list[3]}
        {inlineHighlight(list[4])}
      </>
    );
  }

  if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
    return <span className={HR}>{line}</span>;
  }

  return inlineHighlight(line);
}

type Matcher = {
  re: RegExp;
  render: (m: RegExpExecArray, key: number) => ReactNode;
};

const INLINE_MATCHERS: Matcher[] = [
  {
    re: /^`([^`\n]+)`/,
    render: (m, key) => (
      <Fragment key={key}>
        <span className={MARK}>`</span>
        <span className={CODE_BG}>{m[1]}</span>
        <span className={MARK}>`</span>
      </Fragment>
    ),
  },
  {
    re: /^\*\*([^*\n]+)\*\*/,
    render: (m, key) => (
      <Fragment key={key}>
        <span className={MARK}>**</span>
        <span className={STRONG}>{m[1]}</span>
        <span className={MARK}>**</span>
      </Fragment>
    ),
  },
  {
    re: /^__([^_\n]+)__/,
    render: (m, key) => (
      <Fragment key={key}>
        <span className={MARK}>__</span>
        <span className={STRONG}>{m[1]}</span>
        <span className={MARK}>__</span>
      </Fragment>
    ),
  },
  {
    re: /^\*([^*\n]+)\*/,
    render: (m, key) => (
      <Fragment key={key}>
        <span className={MARK}>*</span>
        <span className={EM}>{m[1]}</span>
        <span className={MARK}>*</span>
      </Fragment>
    ),
  },
  {
    re: /^_([^_\n]+)_/,
    render: (m, key) => (
      <Fragment key={key}>
        <span className={MARK}>_</span>
        <span className={EM}>{m[1]}</span>
        <span className={MARK}>_</span>
      </Fragment>
    ),
  },
  {
    re: /^\[([^\]\n]+)\]\(([^)\n]+)\)/,
    render: (m, key) => (
      <Fragment key={key}>
        <span className={MARK}>[</span>
        <span className={LINK_TEXT}>{m[1]}</span>
        <span className={MARK}>](</span>
        <span className={URL_TEXT}>{m[2]}</span>
        <span className={MARK}>)</span>
      </Fragment>
    ),
  },
];

function inlineHighlight(text: string): ReactNode {
  const out: ReactNode[] = [];
  let buf = "";
  let key = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let matched = false;
    for (const { re, render } of INLINE_MATCHERS) {
      const m = re.exec(rest);
      if (m) {
        flush();
        out.push(render(m, key++));
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      buf += text[i];
      i++;
    }
  }
  flush();
  return out;
}
