import { useEffect } from "react";

interface Props {
  onPickFolder: () => void;
}

export function EmptyState({ onPickFolder }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        onPickFolder();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPickFolder]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#f4f1ea]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.055] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(255,255,255,0.55) 0%, rgba(247,246,243,0) 55%), radial-gradient(ellipse 90% 70% at 50% 100%, rgba(55,53,47,0.08) 0%, rgba(55,53,47,0) 60%)",
        }}
      />

      <div aria-hidden className="pointer-events-none absolute inset-10">
        <CornerTick className="absolute -top-[2px] -left-[2px]" />
        <CornerTick className="absolute -top-[2px] -right-[2px] rotate-90" />
        <CornerTick className="absolute -bottom-[2px] -left-[2px] -rotate-90" />
        <CornerTick className="absolute -bottom-[2px] -right-[2px] rotate-180" />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.5em] text-[#37352f]/40"
        style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}
      >
        agent desk · index · mmxxvi
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.5em] text-[#37352f]/40"
        style={{ writingMode: "vertical-rl" }}
      >
        local · first · forever
      </div>

      <FolderGlyph />

      <div className="relative z-10 mx-auto flex w-full max-w-[680px] flex-col items-start gap-7 px-10">
        <div
          className="empty-reveal flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.34em] text-[#37352f]/55"
          style={{ animationDelay: "60ms" }}
        >
          <span className="inline-block h-[1px] w-12 bg-[#37352f]/30" />
          <span>Folio 00 / 00</span>
          <span className="inline-block h-[3px] w-[3px] rounded-full bg-accent-blue" />
          <span>projects</span>
        </div>

        <h1
          className="empty-reveal font-display text-[108px] font-normal italic leading-[0.88] tracking-[-0.025em] text-[#2a2823]"
          style={{ animationDelay: "140ms" }}
        >
          pick a folder.
        </h1>

        <div
          className="empty-reveal flex items-center gap-4"
          style={{ animationDelay: "240ms" }}
        >
          <span className="inline-block h-px w-20 bg-[#37352f]/30" />
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#37352f]/45">
            step one
          </span>
        </div>

        <p
          className="empty-reveal max-w-[460px] font-sans text-[15.5px] leading-[1.6] text-[#37352f]/75"
          style={{ animationDelay: "320ms" }}
        >
          every project in{" "}
          <span className="font-medium text-[#2a2823]">agent desk</span> is a real
          repository on your disk. no cloud, no copies, no guessing — just the
          code where it already lives.
        </p>

        <div
          className="empty-reveal mt-2 flex items-center gap-6"
          style={{ animationDelay: "420ms" }}
        >
          <button
            type="button"
            onClick={onPickFolder}
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-[#2a2823] px-7 py-[14px] font-mono text-[11px] uppercase tracking-[0.22em] text-[#f4f1ea] shadow-[0_18px_40px_-24px_rgba(35,131,226,0.55),0_1px_0_0_rgba(255,255,255,0.25)_inset] transition-all duration-300 hover:-translate-y-[1px] hover:bg-accent-blue hover:shadow-[0_24px_50px_-20px_rgba(35,131,226,0.6),0_1px_0_0_rgba(255,255,255,0.3)_inset]"
          >
            <span className="relative">choose folder</span>
            <span className="relative inline-block h-[1px] w-5 bg-[#f4f1ea] transition-all duration-300 group-hover:w-8" />
            <span className="relative inline-block transition-transform duration-300 group-hover:translate-x-[3px]">
              →
            </span>
          </button>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#37352f]/40">
            <kbd className="rounded-[4px] border border-[#37352f]/20 bg-white/60 px-[6px] py-[2px] text-[#37352f]/70">
              ⌘
            </kbd>
            <kbd className="rounded-[4px] border border-[#37352f]/20 bg-white/60 px-[6px] py-[2px] text-[#37352f]/70">
              O
            </kbd>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute bottom-10 left-12 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.34em] text-[#37352f]/40"
      >
        <span className="inline-block h-[1px] w-8 bg-[#37352f]/25" />
        <span>{formattedDate()}</span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-10 right-12 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.34em] text-[#37352f]/40"
      >
        <span>sig · ad</span>
        <span className="inline-block h-[1px] w-8 bg-[#37352f]/25" />
      </div>
    </div>
  );
}

function CornerTick({ className = "" }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      className={className}
      aria-hidden
    >
      <path d="M0 1 H10 M1 0 V10" stroke="#37352f" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-[6%] top-1/2 -translate-y-1/2"
      style={{ transform: "translateY(-50%) rotate(-6deg)" }}
    >
      <svg
        width="360"
        height="280"
        viewBox="0 0 360 280"
        fill="none"
        className="opacity-[0.14]"
      >
        <defs>
          <linearGradient id="fgline" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2383e2" />
            <stop offset="100%" stopColor="#2a2823" />
          </linearGradient>
        </defs>
        <path
          d="M20 60 L150 60 L170 40 L340 40 L340 250 L20 250 Z"
          stroke="url(#fgline)"
          strokeWidth="1.25"
          className="empty-draw"
          style={{ animationDelay: "200ms" }}
        />
        <path
          d="M20 80 L340 80"
          stroke="#2a2823"
          strokeOpacity="0.5"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <path d="M40 110 L320 110" stroke="#2a2823" strokeOpacity="0.35" strokeWidth="0.75" />
        <path d="M40 130 L280 130" stroke="#2a2823" strokeOpacity="0.35" strokeWidth="0.75" />
        <path d="M40 150 L300 150" stroke="#2a2823" strokeOpacity="0.35" strokeWidth="0.75" />
        <path d="M40 170 L240 170" stroke="#2a2823" strokeOpacity="0.35" strokeWidth="0.75" />
        <circle cx="310" cy="60" r="3" fill="#2383e2" />
        <g className="empty-scan">
          <path
            d="M40 90 L320 90"
            stroke="#2383e2"
            strokeOpacity="0.7"
            strokeWidth="0.75"
          />
        </g>
      </svg>
    </div>
  );
}

function formattedDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}·${m}·${day}`;
}
