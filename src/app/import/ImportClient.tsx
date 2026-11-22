"use client";

import { useState } from "react";
import Link from "next/link";
import Orb from "@/components/Orb";
import { finishImport, importOldJobs, importOldOpportunities } from "./actions";

type Enc = { v: number; iter: number; salt: string; iv: string; ct: string };
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Same scheme as the old kantimohanthy.com vault: PBKDF2-SHA256 -> AES-256-GCM.
// The password never leaves this browser tab.
async function decrypt(enc: Enc, password: string): Promise<unknown> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(enc.salt), iterations: enc.iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

const rowsOf = (doc: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === "object") {
    for (const k of keys) {
      const v = (doc as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
};

async function inBatches(rows: unknown[], fn: (b: unknown[]) => Promise<{ inserted: number; valid: number; error?: string }>) {
  let inserted = 0, valid = 0, error: string | undefined;
  for (let i = 0; i < rows.length; i += 150) {
    const r = await fn(rows.slice(i, i + 150));
    inserted += r.inserted;
    valid += r.valid;
    if (r.error) error = r.error;
  }
  return { inserted, valid, error };
}

export default function ImportClient() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (l: string) => setLog((x) => [...x, l]);

  async function run(form: FormData) {
    const password = String(form.get("password") ?? "");
    if (!password) return;
    setBusy(true);
    setLog([]);
    try {
      add("Fetching your encrypted vault…");
      const [jobsEnc, appsEnc] = await Promise.all(
        ["jobs", "applications"].map((n) => fetch(`/api/vault/${n}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Vault not available"))))),
      );
      add("Decrypting in your browser (600k-round key derivation, a few seconds)…");
      let jobsDoc: unknown, appsDoc: unknown;
      try {
        [jobsDoc, appsDoc] = await Promise.all([decrypt(jobsEnc, password), decrypt(appsEnc, password)]);
      } catch {
        add("❌ Wrong password — nothing was imported.");
        return;
      }
      const jobs = rowsOf(jobsDoc, ["jobs", "rows", "items"]);
      const apps = rowsOf(appsDoc, ["applications", "rows", "items"]);
      add(`Unlocked: ${apps.length} masters/fellowships/programmes and ${jobs.length} jobs.`);
      const a = await inBatches(apps, importOldOpportunities);
      add(`✅ Opportunities: ${a.inserted} added (${a.valid - a.inserted} already there).`);
      const j = await inBatches(jobs, importOldJobs);
      add(`✅ Jobs: ${j.inserted} added (${j.valid - j.inserted} already tracked or skipped).`);
      if (j.error) add("⚠️ Some jobs were skipped: " + j.error);
      await finishImport(`${a.inserted} opportunities and ${j.inserted} jobs from the old kantimohanthy.com vault.`);
      add("Done. Open Opportunities to see them.");
    } catch (e) {
      add("❌ " + (e instanceof Error ? e.message : "Import failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-12 text-center">
      <Orb size={160} active={busy} />
      <h1 className="text-2xl font-semibold">Bring in your old tracker</h1>
      <p className="text-mist">
        Your masters, fellowships, scholarships and the old job list are encrypted. Enter the password you used on the
        old kantimohanthy.com tracker. It is used only in this browser tab and never sent anywhere.
      </p>
      <form action={run} className="card flex w-full flex-col gap-3 p-6">
        <input name="password" type="password" required autoComplete="off" placeholder="Old tracker password"
          className="rounded-xl border border-line bg-ink px-4 py-3 outline-none focus:border-sky" />
        <button disabled={busy} className="press rounded-xl bg-volt px-4 py-3 font-semibold text-void disabled:opacity-60">
          {busy ? "Working…" : "Unlock & import"}
        </button>
      </form>
      <ul className="w-full space-y-1 text-left text-sm text-mist">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <Link href="/" className="text-sm text-sky">← Back to command center</Link>
    </main>
  );
}
