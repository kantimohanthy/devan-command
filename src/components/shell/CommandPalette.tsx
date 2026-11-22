"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; label: string; hint: string; go: string };

const PLACES: Item[] = [
  { id: "today", label: "Today", hint: "Go to", go: "/?tab=today" },
  { id: "jobs", label: "Jobs", hint: "Go to", go: "/?tab=jobs" },
  { id: "short", label: "Shortlisted jobs", hint: "Go to", go: "/?tab=jobs&f=shortlist" },
  { id: "italy", label: "Jobs confirmed open from Italy", hint: "Go to", go: "/?tab=jobs&f=italy" },
  { id: "masters", label: "Masters", hint: "Go to", go: "/?tab=masters" },
  { id: "funding", label: "Fellowships & funding", hint: "Go to", go: "/?tab=funding" },
  { id: "programmes", label: "Programmes", hint: "Go to", go: "/?tab=programmes" },
  { id: "notes", label: "Notepad", hint: "Go to", go: "/?tab=notes" },
  { id: "sources", label: "Sources and link import", hint: "Go to", go: "/sources" },
];
const EXAMPLES = [
  "Find paid junior Python or backend roles I can do from Rome",
  "Show new internships from my five watchlist companies",
  "Show UK graduate roles that explicitly offer sponsorship",
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase();
    const places = t ? PLACES.filter((p) => p.label.toLowerCase().includes(t)) : PLACES;
    const ask: Item[] = t ? [{ id: "ask", label: q.trim(), hint: "Ask DEVAN", go: `/?cmd=${encodeURIComponent(q.trim())}` }] : EXAMPLES.map((e, i) => ({ id: "ex" + i, label: e, hint: "Try", go: `/?cmd=${encodeURIComponent(e)}` }));
    return [...ask, ...places];
  }, [q]);

  const run = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    router.push(it.go);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-ink px-4 py-2.5 text-left text-sm text-mist hover:border-sky/60 lg:max-w-xl"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span className="truncate">Ask DEVAN or jump anywhere</span>
        <kbd className="ml-auto hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-mist sm:inline">{mac ? "⌘" : "Ctrl"} K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-void/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Ask DEVAN" className="rise-in w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]" onMouseDown={(e) => e.stopPropagation()}>
            <input
              ref={input}
              value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); run(items[sel]); }
              }}
              placeholder="Find internships I can do from Rome…"
              aria-label="Ask DEVAN"
              aria-controls="palette-list"
              aria-activedescendant={items[sel] ? `pal-${items[sel].id}` : undefined}
              className="w-full border-b border-line bg-transparent px-5 py-4 text-[15px] text-snow outline-none placeholder:text-mist"
            />
            <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  id={`pal-${it.id}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(it)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${i === sel ? "bg-raise text-snow" : "text-mist"}`}
                >
                  <span className={`w-20 shrink-0 text-xs ${it.hint === "Ask DEVAN" ? "text-sky" : "text-mist"}`}>{it.hint}</span>
                  <span className="truncate">{it.label}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-5 py-2.5 text-xs text-mist">Enter to run · Esc to close · press / anywhere to open</p>
          </div>
        </div>
      )}
    </>
  );
}
