"use client";

import { useActionState, useTransition, useState } from "react";
import { importFromUrl, searchHiringCafe, syncSourceForm, testHiringCafe, checkUkSponsor, type McpSearchState } from "./actions";

type State = { ok: boolean; message: string; detail?: string[] } | null;

function Result({ s }: { s: State }) {
  if (!s) return null;
  return (
    <p role="status" className={`mt-2 text-sm ${s.ok ? "text-volt" : "text-[#ff9aa8]"}`}>
      {s.message}
      {s.detail?.length ? <span className="block text-xs text-mist">{s.detail.join(" · ")}</span> : null}
    </p>
  );
}

export function SyncButton({ slug, label }: { slug: string; label: string }) {
  const [s, act, pending] = useActionState<State, FormData>(syncSourceForm, null);
  return (
    <form action={act}>
      <input type="hidden" name="slug" value={slug} />
      <button disabled={pending} className="press rounded-lg border border-line px-3 py-1.5 text-sm hover:border-sky disabled:opacity-60">
        {pending ? "Syncing…" : label}
      </button>
      <Result s={s} />
    </form>
  );
}

export function UrlImport() {
  const [s, act, pending] = useActionState<State, FormData>(importFromUrl, null);
  return (
    <form action={act} className="card flex flex-col gap-3 p-5">
      <label htmlFor="url" className="text-sm font-medium">Import a vacancy link</label>
      <p className="text-xs text-mist">
        Works for any board on this page and for employer careers pages. DEVAN reads the employer&apos;s ATS API (Greenhouse, Lever, Ashby) or the page&apos;s structured job data, and keeps both the discovery link and the official vacancy link.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="url" name="url" type="url" required placeholder="https://…" className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 py-2.5 outline-none focus:border-sky" />
        <button disabled={pending} className="press rounded-xl bg-volt px-4 py-2.5 font-semibold text-void disabled:opacity-60">{pending ? "Reading…" : "Import link"}</button>
      </div>
      <Result s={s} />
    </form>
  );
}

export function HiringCafePanel() {
  const [probe, setProbe] = useState<State>(null);
  const [pending, start] = useTransition();
  const [s, act, searching] = useActionState<McpSearchState, FormData>(searchHiringCafe, null);
  return (
    <div className="mt-3 flex flex-col gap-3">
      <button onClick={() => start(async () => setProbe(await testHiringCafe()))} disabled={pending} className="press self-start rounded-lg border border-line px-3 py-1.5 text-sm hover:border-sky disabled:opacity-60">
        {pending ? "Testing…" : "Test connection"}
      </button>
      <Result s={probe} />
      <form action={act} className="flex gap-2">
        <input name="q" aria-label="Role keywords" placeholder="Role, e.g. junior backend engineer" className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-sky" />
        <input name="location" aria-label="Location" placeholder="Location, e.g. Italy" className="w-36 rounded-lg border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-sky" />
        <button disabled={searching} className="press rounded-lg border border-line px-3 py-1.5 text-sm hover:border-sky">{searching ? "…" : "Search"}</button>
      </form>
      {s && (
        <div className="text-sm">
          <p className={s.ok ? "text-mist" : "text-[#ff9aa8]"}>{s.message}</p>
          {s.links?.length ? (
            <ul className="mt-2 space-y-1">
              {s.links.map((l) => (
                <li key={l} className="truncate"><a href={l} target="_blank" rel="noopener noreferrer nofollow" className="text-sky">{l}</a></li>
              ))}
            </ul>
          ) : null}
          {s.text && <details className="mt-2"><summary className="cursor-pointer text-mist">Raw response (untrusted)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-mist">{s.text}</pre></details>}
        </div>
      )}
    </div>
  );
}

export function SponsorCheckButton({ jobId }: { jobId: string }) {
  const [r, setR] = useState<State>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <button type="button" onClick={() => start(async () => setR(await checkUkSponsor(jobId)))} disabled={pending} className="press rounded-lg border border-line px-2 py-1 text-xs hover:border-sky disabled:opacity-60">
        {pending ? "Checking GOV.UK register…" : "Check UK sponsor register"}
      </button>
      <Result s={r} />
    </span>
  );
}
