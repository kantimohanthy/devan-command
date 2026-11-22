"use client";

import { useActionState, useRef } from "react";
import { addJob, addNote } from "@/app/actions";

type S = { error?: string; ok?: boolean } | null;

export function AddJobForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (p: S, f: FormData) => {
    const r = await addJob(p, f);
    if (r?.ok) ref.current?.reset();
    return r;
  }, null as S);
  const input = "rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-sky";
  return (
    <form ref={ref} action={action} className="card grid gap-2 p-4 sm:grid-cols-2">
      <input name="title" required placeholder="Job title" className={input} />
      <input name="company" required placeholder="Company" className={input} />
      <input name="location" placeholder="Location / Remote" className={input} />
      <input name="url" type="url" placeholder="https://link" className={input} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="press rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-void">Add job</button>
        {state?.error && <span className="text-sm text-[#ff8a8a]">{state.error}</span>}
      </div>
    </form>
  );
}

export function NoteForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (p: S, f: FormData) => {
    const r = await addNote(p, f);
    if (r?.ok) ref.current?.reset();
    return r;
  }, null as S);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <textarea name="body" required rows={3} placeholder="Tell DEVAN something to remember…"
        className="rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-sky" />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="press rounded-xl border border-line px-4 py-2 text-sm hover:border-sky">Save note</button>
        {state?.error && <span className="text-sm text-[#ff8a8a]">{state.error}</span>}
      </div>
    </form>
  );
}
