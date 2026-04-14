import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";

interface MarkdownProps {
  children: string;
  className?: string;
}

const components: Components = {
  p: (props) => (
    <p className="m-0 leading-[1.55] whitespace-pre-wrap break-words" {...props} />
  ),
  a: ({ href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-blue underline-offset-2 hover:underline"
      {...props}
    />
  ),
  ul: (props) => (
    <ul className="my-1 pl-[18px] list-disc space-y-0.5" {...props} />
  ),
  ol: (props) => (
    <ol className="my-1 pl-[18px] list-decimal space-y-0.5" {...props} />
  ),
  li: (props) => <li className="leading-[1.55]" {...props} />,
  h1: (props) => <h1 className="text-base font-semibold mt-2 mb-1" {...props} />,
  h2: (props) => <h2 className="text-base font-semibold mt-2 mb-1" {...props} />,
  h3: (props) => <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />,
  h4: (props) => <h4 className="text-sm font-semibold mt-2 mb-1" {...props} />,
  h5: (props) => <h5 className="text-sm font-semibold mt-2 mb-1" {...props} />,
  h6: (props) => <h6 className="text-sm font-semibold mt-2 mb-1" {...props} />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="font-mono text-[0.9em] px-1 py-[1px] rounded bg-bg-hover border border-border-card"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: (props) => (
    <pre
      className="my-1 p-2 rounded bg-bg-hover border border-border-card overflow-x-auto font-mono text-[12px] leading-[1.5] whitespace-pre"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="my-1 pl-3 border-l-2 border-border-card text-text-muted italic"
      {...props}
    />
  ),
  hr: () => <hr className="my-2 border-border-card" />,
  table: (props) => (
    <table className="my-1 border-collapse text-[0.95em]" {...props} />
  ),
  th: (props) => (
    <th className="border border-border-card px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: (props) => (
    <td className="border border-border-card px-2 py-1 align-top" {...props} />
  ),
};

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className} data-testid="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
