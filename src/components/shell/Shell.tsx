import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import CommandPalette from "./CommandPalette";

export type NavId = "today" | "jobs" | "masters" | "funding" | "programmes" | "notes" | "sources" | "import";

const MAIN: { id: NavId; label: string; href: string; icon: string }[] = [
  { id: "today", label: "Today", href: "/?tab=today", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { id: "jobs", label: "Jobs", href: "/?tab=jobs", icon: "M4 7h16v12H4zM9 7V5h6v2" },
  { id: "masters", label: "Masters", href: "/?tab=masters", icon: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5" },
  { id: "funding", label: "Fellowships", href: "/?tab=funding", icon: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" },
  { id: "programmes", label: "Programmes", href: "/?tab=programmes", icon: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" },
  { id: "notes", label: "Notepad", href: "/?tab=notes", icon: "M5 4h10l4 4v12H5zM15 4v4h4" },
];
const SECONDARY: { id: NavId; label: string; href: string; icon: string }[] = [
  { id: "sources", label: "Sources", href: "/sources", icon: "M4 6c4-3 12-3 16 0M7 10c3-2 7-2 10 0M10 14c1-1 3-1 4 0M12 18h.01" },
  { id: "import", label: "Import old tracker", href: "/import", icon: "M12 4v11M7 10l5 5 5-5M5 20h14" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Shell({ active, counts = {}, children }: { active: NavId; counts?: Partial<Record<NavId, number>>; children: ReactNode }) {
  const item = (n: (typeof MAIN)[number], compact = false) => {
    const on = n.id === active;
    return (
      <Link
        key={n.id}
        href={n.href}
        aria-current={on ? "page" : undefined}
        className={
          compact
            ? `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${on ? "text-snow" : "text-mist"}`
            : `press flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] ${on ? "bg-raise text-snow" : "text-mist hover:bg-panel hover:text-snow"}`
        }
      >
        <span className={on ? "text-sky" : ""}><Icon d={n.icon} /></span>
        <span className={compact ? "" : "flex-1 truncate"}>{compact ? n.label.split(" ")[0] : n.label}</span>
        {!compact && counts[n.id] ? <span className="num text-xs text-mist">{counts[n.id]}</span> : null}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line/70 px-4 py-6 lg:flex">
        <Link href="/?tab=today" className="wordmark px-3 text-xl text-snow">devan</Link>
        <nav aria-label="Sections" className="mt-8 flex flex-col gap-0.5">{MAIN.map((n) => item(n))}</nav>
        <nav aria-label="Tools" className="mt-6 flex flex-col gap-0.5 border-t border-line/70 pt-6">{SECONDARY.map((n) => item(n))}</nav>
        <form action={signOut} className="mt-auto">
          <button className="press flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-mist hover:bg-panel hover:text-snow">
            <Icon d="M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z" />
            Lock DEVAN
          </button>
        </form>
      </aside>

      <div className="min-w-0 pb-24 lg:pb-12">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/60 bg-void/85 px-5 py-3 backdrop-blur lg:px-10">
          <Link href="/?tab=today" className="wordmark text-lg lg:hidden">devan</Link>
          <CommandPalette />
        </header>
        <main className="mx-auto max-w-6xl px-5 pt-8 lg:px-10">{children}</main>
      </div>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-void/95 backdrop-blur lg:hidden">
        {[MAIN[0], MAIN[1], MAIN[2], MAIN[3], SECONDARY[0]].map((n) => item(n, true))}
      </nav>
    </div>
  );
}
