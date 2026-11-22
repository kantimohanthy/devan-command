import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Serves the old encrypted vault files only to the signed-in owner.
// They stay AES-256-GCM encrypted; decryption happens in the owner's browser.
const FILES: Record<string, string> = {
  jobs: "jobs.enc.json",
  applications: "applications.enc.json",
};

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = FILES[name];
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!file || !data.user || (data.user.email ?? "").toLowerCase() !== env.ownerEmail()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const body = await readFile(path.join(process.cwd(), "src/data/vault", file), "utf8");
  return new NextResponse(body, {
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
