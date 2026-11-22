"use client";

import { useActionState } from "react";
import Orb from "@/components/Orb";
import { signIn } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null as { error?: string } | null);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <Orb size={200} active={pending} />
      <h1 className="wordmark text-4xl text-snow">devan</h1>
      <form action={action} className="card flex w-full max-w-sm flex-col gap-3 p-6">
        <input name="email" type="email" required autoComplete="email" placeholder="Email"
          className="rounded-xl border border-line bg-ink px-4 py-3 outline-none focus:border-sky" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password"
          className="rounded-xl border border-line bg-ink px-4 py-3 outline-none focus:border-sky" />
        {state?.error && <p className="text-sm text-[#ff8a8a]">{state.error}</p>}
        <button disabled={pending}
          className="press mt-1 rounded-xl bg-volt px-4 py-3 font-semibold text-void disabled:opacity-60">
          {pending ? "Waking DEVAN…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
